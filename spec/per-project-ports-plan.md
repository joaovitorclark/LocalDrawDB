# Per-project ports — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa.
> Os passos usam checkbox (`- [ ]`).

**Goal:** Permitir rodar projetos em instâncias isoladas por porta
(`npm run dev -- --project/--projects/--all [--preview]`) sem alterar o `npm run dev` atual.

**Architecture:** O projeto ativo passa a poder ser **fixado por processo** via env
`LOCALDRAWDB_PROJECT`, que sobrepõe o `activeId` do registry compartilhado. Um launcher
multimodo spawna um par (Fastify+Vite) por projeto. O frontend, ao detectar o pin, mostra
um rótulo read-only em vez do seletor.

**Tech Stack:** Node (`scripts/*.mjs`, `child_process`), Fastify (`server/*.ts`),
React (`src/*.tsx`), Vitest, tsx, Vite, playwright-core (Chrome do sistema).

## Global Constraints

- `npm run dev` **sem flags** = comportamento idêntico ao atual (instância compartilhada,
  seletor de projeto ativo). Não-regressão é critério de aceite (AC1 da spec).
- Pin vive em `process.env.LOCALDRAWDB_PROJECT`, **nunca** no `projects.json`.
- Toda branch nova é `if (pin) … else <comportamento atual>`.
- Suíte verde (`npm test`) e typecheck limpo (`npm run typecheck`) a cada commit.
- Testes de servidor usam `LOCALDRAWDB_DATA_DIR` apontando para tmpdir isolado (nunca o
  `data/` real). Fixtures genéricas.
- Spec de referência: `spec/per-project-ports-spec.md`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Fase |
|---------|------------------|------|
| `server/files.ts` | `pinnedSlug()`; pin-aware `getActiveSlug`/`getActiveId`/`setActiveProject` | F1 |
| `server/routes.ts` | `/api/meta` expõe pin; guards de CRUD/activate | F1 |
| `server/__tests__/pinnedProject.test.ts` | testes do pin (novos) | F1 |
| `scripts/devArgs.mjs` | parser puro de flags (`parseDevArgs`) | F2 |
| `scripts/dev.mjs` | orquestração multimodo (spawn por slug, supervisão) | F2/F4 |
| `scripts/__tests__/devArgs.test.ts` | testes do parser | F2 |
| `src/api.ts` | tipo de `/api/meta` com `pinnedProject` | F3 |
| `src/ProjectSwitcher.tsx` | rótulo read-only sob pin | F3 |
| `src/App.tsx` | propaga pin ao `ProjectSwitcher` | F3 |
| `scripts/verify-per-project-ports.mjs` | verificação no navegador | F3 |

---

## FASE 1 — Pin no servidor (executar agora)

### Task 1.1: `pinnedSlug()` + `getActiveSlug`/`getActiveId` pin-aware

**Files:**
- Modify: `server/files.ts` (após `getActiveId`, ~L321; e `getActiveSlug` ~L334)
- Test: `server/__tests__/pinnedProject.test.ts` (criar)

**Interfaces:**
- Produces: `pinnedSlug(): Promise<string | null>` — lê `process.env.LOCALDRAWDB_PROJECT`,
  valida contra o registry (lança se slug inexistente), retorna o slug ou `null`.
- `getActiveSlug()` e `getActiveId()` passam a honrar o pin.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/__tests__/pinnedProject.test.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-pin-'));
  process.env.LOCALDRAWDB_DATA_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.LOCALDRAWDB_DATA_DIR;
  delete process.env.LOCALDRAWDB_PROJECT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function seedTwo() {
  const files = await import('../files.ts');
  const a = await files.createProject('Alpha'); // primeiro = ativo
  const b = await files.createProject('Beta');
  return { a, b, files };
}

describe('pin de projeto por processo', () => {
  it('getActiveSlug/getActiveId honram LOCALDRAWDB_PROJECT', async () => {
    const { b, files } = await seedTwo();
    process.env.LOCALDRAWDB_PROJECT = b.slug;
    expect(await files.getActiveSlug()).toBe(b.slug);
    expect(await files.getActiveId()).toBe(b.id);
  });

  it('sem pin, segue o activeId do registry (não-regressão)', async () => {
    const { a, files } = await seedTwo();
    expect(await files.getActiveId()).toBe(a.id);
    expect(await files.getActiveSlug()).toBe(a.slug);
  });

  it('pin com slug inexistente lança erro claro', async () => {
    const { files } = await seedTwo();
    process.env.LOCALDRAWDB_PROJECT = 'nao-existe';
    await expect(files.pinnedSlug()).rejects.toThrow(/nao-existe/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: FAIL — `files.pinnedSlug is not a function` / asserts de pin falham.

- [ ] **Step 3: Implementar o mínimo**

Em `server/files.ts`, adicionar `pinnedSlug` e tornar os getters pin-aware:

```ts
/** Slug fixado por processo (LOCALDRAWDB_PROJECT), validado, ou null. */
export async function pinnedSlug(): Promise<string | null> {
  const slug = process.env.LOCALDRAWDB_PROJECT?.trim();
  if (!slug) return null;
  const reg = await readRegistry();
  if (!reg.projects.some((p) => p.slug === slug)) {
    throw new Error(`LOCALDRAWDB_PROJECT="${slug}" não existe no registry`);
  }
  return slug;
}
```

Substituir `getActiveSlug` por:

```ts
export async function getActiveSlug(): Promise<string> {
  const pin = await pinnedSlug();
  if (pin) return pin;
  const reg = await readRegistry();
  const proj = reg.projects.find((p) => p.id === reg.activeId);
  if (!proj) {
    if (reg.projects.length > 0) return reg.projects[0].slug;
    throw new Error('Nenhum projeto ativo. Execute migrateLegacy() primeiro.');
  }
  return proj.slug;
}
```

Substituir `getActiveId` por:

```ts
export async function getActiveId(): Promise<string> {
  const reg = await readRegistry();
  const pin = await pinnedSlug();
  if (pin) {
    const proj = reg.projects.find((p) => p.slug === pin);
    if (proj) return proj.id;
  }
  return reg.activeId;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add server/files.ts server/__tests__/pinnedProject.test.ts
git commit -m "feat(ports): pin de projeto por processo (getActiveSlug/Id)"
```

### Task 1.2: `setActiveProject` no-op sob pin

**Files:**
- Modify: `server/files.ts:309-316` (`setActiveProject`)
- Test: `server/__tests__/pinnedProject.test.ts`

- [ ] **Step 1: Adicionar teste que falha**

Acrescentar ao `describe`:

```ts
it('setActiveProject é no-op quando há pin', async () => {
  const { a, b, files } = await seedTwo();
  process.env.LOCALDRAWDB_PROJECT = b.slug;
  await files.setActiveProject(a.id); // não deve persistir
  delete process.env.LOCALDRAWDB_PROJECT;
  expect(await files.getActiveId()).toBe(a.id); // activeId original intacto
});
```

> Nota: `a.id` é o ativo original (Alpha foi criado primeiro). O teste garante que o
> `setActiveProject(a.id)` sob pin não alterou o `activeId` para algo diferente — e como
> o ativo já era `a.id`, validamos que **nada foi escrito** observando que segue `a.id`.
> Para robustez, primeiro mude o ativo para Beta sem pin e depois tente voltar sob pin:

```ts
it('setActiveProject não persiste sob pin', async () => {
  const { a, b, files } = await seedTwo();
  await files.setActiveProject(b.id);          // sem pin: ativo = Beta
  process.env.LOCALDRAWDB_PROJECT = a.slug;    // pin em Alpha
  await files.setActiveProject(a.id);          // no-op — mudaria p/ Alpha se o guard sumisse
  delete process.env.LOCALDRAWDB_PROJECT;
  expect(await files.getActiveId()).toBe(b.id); // continua Beta (pin não escreveu)
});
```

> **Importante:** a chamada sob pin usa `a.id` (≠ do ativo já persistido `b.id`) de
> propósito — se fosse `b.id`, o teste passaria mesmo sem o guard (tautologia).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: FAIL no novo teste (o no-op ainda não existe).

- [ ] **Step 3: Implementar**

```ts
export async function setActiveProject(id: string): Promise<void> {
  if (await pinnedSlug()) return; // instância fixada não persiste activeId compartilhado
  const reg = await readRegistry();
  if (!reg.projects.find((p) => p.id === id)) {
    throw new Error(`Projeto não encontrado: ${id}`);
  }
  reg.activeId = id;
  await writeRegistry(reg);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/files.ts server/__tests__/pinnedProject.test.ts
git commit -m "feat(ports): setActiveProject vira no-op sob pin"
```

### Task 1.3: `/api/meta` expõe `pinnedProject`/`pinnedProjectId`

**Files:**
- Modify: `server/routes.ts:116-121` (`/api/meta`) e imports de `./files.ts`
- Test: `server/__tests__/pinnedProject.test.ts`

**Interfaces:**
- Produces: `/api/meta` retorna `{ ...atual, pinnedProject: string|null, pinnedProjectId: string|null }`.

- [ ] **Step 1: Teste que falha (via app.inject)**

```ts
it('/api/meta expõe pinnedProject quando fixado', async () => {
  const { b } = await seedTwo();
  process.env.LOCALDRAWDB_PROJECT = b.slug;
  const { default: Fastify } = await import('fastify');
  const { registerRoutes } = await import('../routes.ts');
  const app = Fastify();
  await registerRoutes(app);
  const meta = (await app.inject({ method: 'GET', url: '/api/meta' })).json() as any;
  await app.close();
  expect(meta.pinnedProject).toBe(b.slug);
  expect(meta.pinnedProjectId).toBe(b.id);
});
```

> Atenção: `registerRoutes` chama `migrateLegacy()`, que pode semear um projeto default.
> Como `seedTwo()` já criou Alpha/Beta, o registry não está vazio e a migração é no-op.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: FAIL — `meta.pinnedProject` é `undefined`.

- [ ] **Step 3: Implementar**

Em `server/routes.ts`, garantir imports `pinnedSlug, readRegistry` de `./files.ts`, e:

```ts
app.get('/api/meta', async () => {
  const pin = await pinnedSlug();
  let pinnedProjectId: string | null = null;
  if (pin) {
    const reg = await readRegistry();
    pinnedProjectId = reg.projects.find((p) => p.slug === pin)?.id ?? null;
  }
  return {
    root: ROOT,
    dataDir: DATA_DIR,
    inputDir: await getActiveInputDir(),
    port: Number(process.env.PORT ?? 5174),
    pinnedProject: pin,
    pinnedProjectId,
  };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/__tests__/pinnedProject.test.ts
git commit -m "feat(ports): /api/meta expõe pinnedProject/pinnedProjectId"
```

### Task 1.4: Guards de CRUD e `activate` sob pin

**Files:**
- Modify: `server/routes.ts` — `requireUnpinned` helper; guards em `POST /api/projects`,
  `DELETE/PATCH /api/projects/:id`, `POST /api/projects/:id/duplicate`,
  `POST /api/projects/:id/activate` (~L134, L170, L184, L203, L218)
- Test: `server/__tests__/pinnedProject.test.ts`

**Interfaces:**
- Consumes: `pinnedSlug()` (Task 1.1).
- Produces: helper `requireUnpinned(reply): Promise<boolean>` (responde 409 e retorna
  `false` quando há pin; senão `true`).

- [ ] **Step 1: Testes que falham**

```ts
it('CRUD de projeto retorna 409 sob pin; activate é no-op', async () => {
  const { a, b } = await seedTwo();
  process.env.LOCALDRAWDB_PROJECT = b.slug;
  const { default: Fastify } = await import('fastify');
  const { registerRoutes } = await import('../routes.ts');
  const app = Fastify();
  await registerRoutes(app);

  const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'X' } });
  expect(create.statusCode).toBe(409);

  const del = await app.inject({ method: 'DELETE', url: `/api/projects/${a.id}` });
  expect(del.statusCode).toBe(409);

  const act = await app.inject({ method: 'POST', url: `/api/projects/${a.id}/activate` });
  expect(act.statusCode).toBe(200);
  expect(act.json()).toMatchObject({ ok: true, pinned: b.slug });

  // leitura segue funcionando
  const list = await app.inject({ method: 'GET', url: '/api/projects' });
  expect(list.statusCode).toBe(200);
  await app.close();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts`
Expected: FAIL — create/delete retornam 200, activate não traz `pinned`.

- [ ] **Step 3: Implementar**

Adicionar helper no topo das rotas de projetos em `server/routes.ts`:

```ts
async function requireUnpinned(reply: import('fastify').FastifyReply): Promise<boolean> {
  const pin = await pinnedSlug();
  if (pin) {
    reply.code(409).send({ error: `Instância fixada no projeto "${pin}"; gerenciamento desabilitado.` });
    return false;
  }
  return true;
}
```

No `POST /api/projects` (e `DELETE`, `PATCH`, `duplicate`), primeira linha do handler:

```ts
if (!(await requireUnpinned(reply))) return;
```

No `POST /api/projects/:id/activate`:

```ts
app.post<{ Params: { id: string } }>('/api/projects/:id/activate', async (req, reply) => {
  const pin = await pinnedSlug();
  if (pin) return { ok: true, pinned: pin };
  try {
    await setActiveProject(req.params.id);
    return { ok: true, activeId: req.params.id };
  } catch (e: any) {
    if (e?.message?.includes('não encontrado')) return reply.code(404).send({ error: e.message });
    throw e;
  }
});
```

- [ ] **Step 4: Rodar e ver passar (suíte inteira)**

Run: `npx vitest run server/__tests__/pinnedProject.test.ts && npm test && npm run typecheck`
Expected: PASS em tudo (sem regressão nas rotas existentes).

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/__tests__/pinnedProject.test.ts
git commit -m "feat(ports): guards 409 no CRUD e activate no-op sob pin"
```

**F1 concluída:** servidor fixável por env, meta expõe o pin, escrita compartilhada
protegida. `npm run dev` atual continua intacto (nenhum env setado).

---

## FASE 2 — Launcher dev multimodo

Detalhamento bite-sized. Arquivos: `scripts/devArgs.mjs` (novo — parser + resolver puros),
`scripts/__tests__/devArgs.test.ts` (novo), `scripts/dev.mjs` (orquestração), `server/index.ts`
(validação no boot). Ordem: 2.1 → 2.2 (puros, TDD) → 2.0 (wiring) → 2.3 (integração).
`--preview` é apenas **parseado** aqui; sua implementação é a F4 — em F2 o launcher recusa
`--preview` com mensagem "chega na F4".

### Task 2.1: `parseDevArgs(argv)` — parser puro

**Files:**
- Create: `scripts/devArgs.mjs`
- Test: `scripts/__tests__/devArgs.test.ts`

**Interfaces:**
- Produces: `parseDevArgs(argv: string[]): { mode: 'shared'|'project'|'all', slugs: string[]|null, preview: boolean }`.
  `argv` = `process.argv.slice(2)`. Lança `Error` em uso inválido.

- [ ] **Step 1: Teste que falha** — criar `scripts/__tests__/devArgs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDevArgs } from '../devArgs.mjs';

describe('parseDevArgs', () => {
  it('sem flags = shared', () => {
    expect(parseDevArgs([])).toEqual({ mode: 'shared', slugs: null, preview: false });
  });
  it('--project x', () => {
    expect(parseDevArgs(['--project', 'vendas'])).toEqual({ mode: 'project', slugs: ['vendas'], preview: false });
  });
  it('--projects x,y', () => {
    expect(parseDevArgs(['--projects', 'a, b'])).toEqual({ mode: 'project', slugs: ['a', 'b'], preview: false });
  });
  it('--all', () => {
    expect(parseDevArgs(['--all'])).toEqual({ mode: 'all', slugs: null, preview: false });
  });
  it('--preview combina com --all', () => {
    expect(parseDevArgs(['--all', '--preview'])).toEqual({ mode: 'all', slugs: null, preview: true });
  });
  it('--all + --project é erro', () => {
    expect(() => parseDevArgs(['--all', '--project', 'x'])).toThrow(/ambos/);
  });
  it('--projects sem valor é erro', () => {
    expect(() => parseDevArgs(['--projects'])).toThrow(/exige/);
  });
  it('flag desconhecida é erro', () => {
    expect(() => parseDevArgs(['--bogus'])).toThrow(/desconhecida/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run scripts/__tests__/devArgs.test.ts`
Expected: FAIL — `parseDevArgs is not a function` / módulo ausente.

- [ ] **Step 3: Implementar** — criar `scripts/devArgs.mjs`:

```js
// Parser puro das flags do `npm run dev` multimodo. Sem efeitos colaterais.
export function parseDevArgs(argv) {
  let mode = 'shared';
  const slugs = [];
  let preview = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') {
      if (mode === 'project') throw new Error('Use --all OU --project(s), não ambos.');
      mode = 'all';
    } else if (a === '--project' || a === '--projects') {
      if (mode === 'all') throw new Error('Use --all OU --project(s), não ambos.');
      const val = argv[++i];
      if (!val || val.startsWith('--')) throw new Error(`${a} exige um slug (ex.: ${a} vendas).`);
      for (const s of val.split(',').map((x) => x.trim()).filter(Boolean)) slugs.push(s);
      mode = 'project';
    } else if (a === '--preview') {
      preview = true;
    } else {
      throw new Error(`Flag desconhecida: ${a}`);
    }
  }
  if (mode === 'project' && slugs.length === 0) throw new Error('--project(s) exige ao menos um slug.');
  return { mode, slugs: mode === 'project' ? slugs : null, preview };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run scripts/__tests__/devArgs.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add scripts/devArgs.mjs scripts/__tests__/devArgs.test.ts
git commit -m "feat(ports): parseDevArgs — parser das flags do dev multimodo"
```

### Task 2.2: `resolveSlugs(parsed, registry)` — resolver puro

**Files:**
- Modify: `scripts/devArgs.mjs` (adicionar export)
- Test: `scripts/__tests__/devArgs.test.ts`

**Interfaces:**
- Consumes: o objeto de `parseDevArgs` e um `registry` no formato `{ projects: { slug: string }[] }`.
- Produces: `resolveSlugs(parsed, registry): string[] | null`. `shared` → `null`; `all` →
  todos os slugs; `project` → os slugs pedidos, **lançando** se algum não existir (mensagem
  lista os disponíveis).

- [ ] **Step 1: Teste que falha** — acrescentar ao arquivo de teste:

```ts
import { parseDevArgs, resolveSlugs } from '../devArgs.mjs';

const REG = { projects: [{ slug: 'alpha' }, { slug: 'beta' }] };

describe('resolveSlugs', () => {
  it('shared → null', () => {
    expect(resolveSlugs(parseDevArgs([]), REG)).toBeNull();
  });
  it('all → todos os slugs', () => {
    expect(resolveSlugs(parseDevArgs(['--all']), REG)).toEqual(['alpha', 'beta']);
  });
  it('project existente', () => {
    expect(resolveSlugs(parseDevArgs(['--project', 'beta']), REG)).toEqual(['beta']);
  });
  it('project inexistente lança listando disponíveis', () => {
    expect(() => resolveSlugs(parseDevArgs(['--project', 'nope']), REG)).toThrow(/alpha, beta/);
  });
});
```

> Ajuste o `import` no topo do arquivo de teste para incluir `resolveSlugs`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run scripts/__tests__/devArgs.test.ts`
Expected: FAIL — `resolveSlugs is not a function`.

- [ ] **Step 3: Implementar** — adicionar a `scripts/devArgs.mjs`:

```js
export function resolveSlugs(parsed, registry) {
  const available = registry.projects.map((p) => p.slug);
  if (parsed.mode === 'shared') return null;
  if (parsed.mode === 'all') {
    if (available.length === 0) throw new Error('Nenhum projeto no registry.');
    return available;
  }
  const missing = parsed.slugs.filter((s) => !available.includes(s));
  if (missing.length) {
    throw new Error(
      `Slug(s) inexistente(s): ${missing.join(', ')}. Disponíveis: ${available.join(', ') || '(nenhum)'}`,
    );
  }
  return parsed.slugs;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run scripts/__tests__/devArgs.test.ts`
Expected: PASS (12 testes no total).

- [ ] **Step 5: Commit**

```bash
git add scripts/devArgs.mjs scripts/__tests__/devArgs.test.ts
git commit -m "feat(ports): resolveSlugs — valida slugs contra o registry"
```

### Task 2.0: Validação do pin no boot (`server/index.ts`)

**Files:**
- Modify: `server/index.ts` (`main()`)

**Interfaces:**
- Consumes: `pinnedSlug()` de `./files.ts` (já existe; lança se `LOCALDRAWDB_PROJECT` inválido).

Sem teste unitário novo (o lançamento de `pinnedSlug` já é coberto por
`server/__tests__/pinnedProject.test.ts`). Deliverable verificado por smoke do controller.

- [ ] **Step 1: Implementar** — em `server/index.ts`, importar `pinnedSlug` de `./files.ts`
  e, dentro de `main()`, logo após `await migrateLegacy();`, adicionar:

```ts
  // Falha cedo se LOCALDRAWDB_PROJECT apontar para um projeto inexistente.
  await pinnedSlug();
```

- [ ] **Step 2: Smoke (controller)** — `LOCALDRAWDB_PROJECT=nao-existe npm start` deve sair
  com código ≠ 0 e mensagem clara; `npm start` normal sobe igual a hoje. Rodar `npm run typecheck`.

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat(ports): valida LOCALDRAWDB_PROJECT no boot do servidor"
```

### Task 2.3: `dev.mjs` multimodo (orquestração)

**Files:**
- Modify: `scripts/dev.mjs`

**Interfaces:**
- Consumes: `parseDevArgs`/`resolveSlugs` (`./devArgs.mjs`), `allocateDevPorts`/`waitForPort`
  (`./devPorts.mjs`).

Integração de processos — não unit-testável. Deliverable verificado por smoke do controller
(subir `--projects alpha,beta` em data dir isolado, checar dois `web` respondendo, encerrar).

- [ ] **Step 1: Refatorar para multimodo.** Reescrever `scripts/dev.mjs` mantendo o caminho
  `shared` idêntico ao atual. Estrutura:
  - `parseDevArgs(process.argv.slice(2))`; se `preview` → `console.error('modo --preview chega na F4')` + `process.exit(1)`.
  - **Extrair** `startInstance({ slug, apiPort, webPort })` que faz o spawn atual de
    `tsx watch server/index.ts` + (após `waitForPort`) `vite --port <web> --strictPort`,
    com env `{ ...process.env, PORT, API_PORT, VITE_PORT, ...(slug ? { LOCALDRAWDB_PROJECT: slug } : {}) }`,
    e retorna `{ server, web }`.
  - **Modo `shared`** (`slugs === null` após `resolveSlugs`): `allocateDevPorts()` → uma
    instância sem slug; saída e `.localdrawdb-dev.json` no formato de hoje
    (`{ apiPort, webPort, root }`) **OU** já no formato novo (ver Step 2). Manter a saída
    de uma linha por URL como hoje.
  - **Modo multi** (`slugs` é array): ler o registry de
    `path.join(process.env.LOCALDRAWDB_DATA_DIR ?? path.join(ROOT, 'data'), 'projects.json')`,
    `resolveSlugs(parsed, registry)`; para cada slug, `allocateDevPorts()` e `startInstance`;
    imprimir tabela `projeto | web | api`.
  - **Supervisão:** coletar todos os filhos; `SIGINT/SIGTERM` mata todos e remove o meta;
    qualquer filho com exit ≠ 0 derruba o conjunto (como hoje, generalizado para N).

- [ ] **Step 2: `.localdrawdb-dev.json` array.** Gravar
  `{ instances: [{ slug, apiPort, webPort }], root }` (no modo `shared`, `slug: null`).
  Se algum leitor do formato antigo existir, atualizar no mesmo commit (grep
  `localdrawdb-dev` no repo).

- [ ] **Step 3: Smoke (controller).** Em data dir isolado com 2 projetos:
  `LOCALDRAWDB_DATA_DIR=/tmp/xxx npm run dev -- --projects alpha,beta` → tabela com 2 linhas,
  dois `web` respondendo (curl), Ctrl-C encerra ambos e some o meta. `npm run dev` puro =
  comportamento de hoje.

- [ ] **Step 4: Commit**

```bash
git add scripts/dev.mjs
git commit -m "feat(ports): dev.mjs multimodo (--project/--projects/--all)"
```

## FASE 3 — Frontend fixado

Detalhamento bite-sized. Sem harness de teste de componente React no repo (testes são
server/dsl), então a verificação da UI é o **browser smoke** (`scripts/verify-*.mjs` +
Chrome do sistema, padrão da memória `headless-verify-system-chrome`). Arquivos:
`src/api.ts`, `src/ProjectSwitcher.tsx`, `src/App.tsx`, `src/styles.css`,
`scripts/verify-per-project-ports.mjs` (novo). Ordem: 3.1 implementação → 3.2 verificação.

### Task 3.1: Frontend pin-aware (api `getMeta` + `ProjectSwitcher` 📌 + wiring no `App`)

**Files:**
- Modify: `src/api.ts` (tipo `Meta` + `getMeta`)
- Modify: `src/ProjectSwitcher.tsx` (prop `pinnedLabel`)
- Modify: `src/App.tsx` (busca meta, passa `pinnedLabel`)
- Modify: `src/styles.css` (estilo do rótulo fixado)

**Interfaces:**
- Produces: `getMeta(): Promise<Meta>` onde
  `Meta = { root; dataDir; inputDir; port; pinnedProject: string|null; pinnedProjectId: string|null }`.
- `ProjectSwitcher` ganha prop opcional `pinnedLabel?: string`.

- [ ] **Step 1: `src/api.ts` — tipo + fetch.** Após `ProjectMeta` (ou junto dos demais
  fetchers), adicionar:

```ts
export type Meta = {
  root: string;
  dataDir: string;
  inputDir: string;
  port: number;
  pinnedProject: string | null;
  pinnedProjectId: string | null;
};

export const getMeta = (): Promise<Meta> => get('/api/meta');
```

(`get<T>` já existe em `src/api.ts`.)

- [ ] **Step 2: `src/ProjectSwitcher.tsx` — rótulo fixado.** Adicionar `pinnedLabel?: string`
  ao tipo `Props`. No componente, ANTES do `return` principal (após os hooks/handlers,
  ex.: depois de `const isDirty = ...`), inserir um early-return:

```tsx
  if (pinnedLabel) {
    return (
      <div
        className="project-switcher project-switcher--pinned"
        title="Instância fixada neste projeto (porta dedicada)"
      >
        <span className="project-switcher__pin" aria-hidden="true">📌</span>
        <span className="project-switcher__name">{pinnedLabel}</span>
      </div>
    );
  }
```

Incluir `pinnedLabel` na desestruturação das props do componente. Sem `pinnedLabel`, o
caminho atual (trigger + dropdown) fica intacto.

- [ ] **Step 3: `src/App.tsx` — buscar meta e passar `pinnedLabel`.**
  - Adicionar estado: `const [pinnedProjectId, setPinnedProjectId] = useState<string | null>(null);`
  - Em um `useEffect` de montagem (pode ser um novo, ao lado do que chama `listProjects`):
    ```tsx
    useEffect(() => {
      api.getMeta().then((m) => setPinnedProjectId(m.pinnedProjectId)).catch(() => {});
    }, []);
    ```
  - Na renderização do `<ProjectSwitcher .../>`, acrescentar a prop:
    ```tsx
    pinnedLabel={pinnedProjectId ? projects.find((p) => p.id === pinnedProjectId)?.name : undefined}
    ```
  Quando fixado, o switcher vira rótulo (sem dropdown), então as ações de troca/CRUD não
  ficam acessíveis — nada mais a suprimir.

- [ ] **Step 4: `src/styles.css` — estilo do rótulo.** Adicionar uma regra discreta:

```css
.project-switcher--pinned {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-weight: 600;
  color: #13284b;
  background: #eef2f8;
  border-radius: 6px;
}
.project-switcher__pin { font-size: 0.9em; }
```

(Ajustar às variáveis/tokens existentes em `styles.css` se houver — seguir o padrão do
arquivo.)

- [ ] **Step 5: Verificar build/typecheck.** `npm run typecheck` limpo; `npm run build`
  conclui. Suíte (`npm test`) permanece verde (nenhuma mudança de servidor).

- [ ] **Step 6: Commit.**

```bash
git add src/api.ts src/ProjectSwitcher.tsx src/App.tsx src/styles.css
git commit -m "feat(ports): UI fixada — rótulo 📌 e getMeta (esconde o seletor sob pin)"
```

### Task 3.2: Verificação no navegador (`scripts/verify-per-project-ports.mjs`)

**Files:**
- Create: `scripts/verify-per-project-ports.mjs`

Integração de UI — verificada com Chrome do sistema (memória `headless-verify-system-chrome`).
Deliverable rodado pelo controller.

- [ ] **Step 1: Script de verificação.** Seguindo o padrão de `scripts/verify-*.mjs`
  existentes (playwright-core dirigindo o Chrome do sistema em
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, captura de
  `pageerror`/`console` e falha se houver qualquer erro): em um `LOCALDRAWDB_DATA_DIR`
  isolado com ≥1 projeto, subir o servidor de produção com `LOCALDRAWDB_PROJECT=<slug>`
  (build antes), abrir a web, e asserir:
  - existe `.project-switcher--pinned` com o texto do projeto (📌);
  - **não** existe `.project-switcher__trigger` (o dropdown de troca sumiu);
  - zero erros de console/página.

- [ ] **Step 2: Controller roda o smoke.** Build + servidor com pin + Chrome; confirmar as
  asserções e zero erros. (Como o servidor de produção serve `dist/`, e o pin é por env,
  reaproveita o `LOCALDRAWDB_PROJECT` validado no boot da F2.)

- [ ] **Step 3: Commit do script.**

```bash
git add scripts/verify-per-project-ports.mjs
git commit -m "test(ports): verificação no navegador da UI fixada"
```

## FASE 4 — Modo `--preview` (alavanca de memória)

Detalhamento bite-sized. Em `--preview`, cada projeto sobe **só** um Fastify de produção
(`NODE_ENV=production tsx server/index.ts`), que serve `dist/` (UI) **e** `/api` na **mesma
porta** — sem Vite, sem watch. Logo, preview precisa de **1 porta por instância** (não um
par). Arquivos: `scripts/dev.mjs`. Verificação: smoke do controller (sem teste unitário —
orquestração de processos). Ordem: 4.1 implementação → 4.2 smoke.

### Task 4.1: Implementar `--preview` no `dev.mjs`

**Files:**
- Modify: `scripts/dev.mjs`

**Interfaces:**
- Consumes: `findFreePort` (`./devPorts.mjs`, já exportado), `parseDevArgs`/`resolveSlugs`
  (`./devArgs.mjs`), `waitForPort`.

- [ ] **Step 1: Substituir o stub de preview pela implementação.** Hoje o `dev.mjs` tem:
  ```js
  if (parsed.preview) {
    console.error('modo --preview chega na F4');
    process.exit(1);
  }
  ```
  Trocar por um caminho de preview que:
  - **Build único:** se `dist/index.html` não existir, rodar `vite build` uma vez
    (spawn `VITE_CLI build`, `stdio: 'inherit'`, aguardar exit; abortar se ≠ 0). Se já
    existir, imprimir "(reusando dist/ existente)".
  - **Resolver alvos:** `shared` → uma instância sem slug (`[null]`); senão, ler o registry
    de `path.join(process.env.LOCALDRAWDB_DATA_DIR ?? path.join(ROOT, 'data'), 'projects.json')`
    e `resolveSlugs(parsed, registry)`.
  - **Portas:** 1 porta livre por instância, acumulando exclusões:
    ```js
    import { findFreePort } from './devPorts.mjs';
    const used = new Set();
    // por instância:
    const port = await findFreePort(Number(process.env.PORT) || 5174, '127.0.0.1', used);
    used.add(port);
    ```
  - **Spawn estático:** helper `startPreviewInstance({ slug, port })`:
    ```js
    function startPreviewInstance({ slug, port }) {
      const env = {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        ...(slug ? { LOCALDRAWDB_PROJECT: slug } : {}),
      };
      const server = spawn(process.execPath, [TSX_CLI, 'server/index.ts'], {
        cwd: ROOT, env, stdio: 'inherit',
      });
      return { server, web: null }; // sem Vite no preview
    }
    ```
  - **Meta + tabela:** `.localdrawdb-dev.json` =
    `{ instances: [{ slug, apiPort: port, webPort: port, preview: true }], root }`. Imprimir
    tabela `projeto | url` com `http://127.0.0.1:<port>`.
  - **Supervisão:** reusar `instances`/`shutdown`/`supervise`. Como `web` pode ser `null` no
    preview, o `shutdown` e o `supervise` devem tratar `web == null` (só matar/observar o
    `server`). Ajustar:
    ```js
    // shutdown:
    for (const { server, web } of instances) { server.kill('SIGTERM'); web?.kill('SIGTERM'); }
    // supervise:
    handle.server.on('exit', (code) => { if (code && code !== 0) shutdown(code); });
    if (handle.web) handle.web.on('exit', (code) => { if (code && code !== 0) shutdown(code); });
    ```
  - O caminho **dev** (sem `--preview`) permanece exatamente como na F2.

- [ ] **Step 2: Sanity (sem hang).** `node scripts/dev.mjs --preview --projects <inexistente>`
  → exit ≠ 0 com "Slug(s) inexistente(s)" (resolveSlugs falha antes de buildar/spawnar).
  `npm run typecheck` limpo; `npm test` verde (nada de servidor mudou).
  **Não** rodar `--preview` com slug real (spawna servidor que fica vivo) — é o smoke do controller.

- [ ] **Step 3: Commit.**

```bash
git add scripts/dev.mjs
git commit -m "feat(ports): modo --preview (Fastify estático por projeto, sem Vite)"
```

### Task 4.2: Smoke do controller

- [ ] **Step 1:** Em data dir isolado com 2 projetos, `--projects a,b --preview`:
  build roda 1×; sobem 2 Fastify de produção em portas distintas; **nenhum processo Vite**
  no conjunto (`pgrep -f vite` vazio entre os filhos); cada porta serve a UI (`GET /` → HTML)
  e `/api/meta` com o `pinnedProject` certo; Ctrl-C encerra todos e remove o meta.

---

## Self-review (cobertura da spec)

- AC1 (default intacto) → Tasks 1.1–1.4 com branches `if (pin) else atual` + teste de
  não-regressão (1.1 step 1, segundo teste) + `npm test` full em 1.4.
- AC2 (pin) → Task 1.1. AC3 (no-op write) → Task 1.2. AC4 (409 CRUD) → Task 1.4.
  AC5 (meta) → Task 1.3. AC6 (frontend) → Fase 3. AC7 (launcher) → Fase 2.
  AC8 (preview) → Fase 4. AC9 (suíte/typecheck) → gate em 1.4 step 4.
- Consistência de tipos: `pinnedSlug(): Promise<string|null>` usado igual em files.ts e
  routes.ts; `pinnedProject`/`pinnedProjectId` idênticos em meta (1.3) e frontend (3.1).
- Sem placeholders na Fase 1 (código completo). Fases 2–4 propositalmente em esboço de
  tarefas: serão detalhadas em bite-sized ao serem iniciadas, conforme decisão de começar
  pela F1.
