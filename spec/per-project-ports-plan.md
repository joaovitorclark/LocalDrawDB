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

> Detalhar passo a passo ao iniciar a fase (após F1). Esboço de tarefas:

- **Task 2.1 — `parseDevArgs(argv)` (puro, testável):** novo `scripts/devArgs.mjs`
  retornando `{ mode: 'shared'|'multi', slugs: string[]|null, preview: boolean }`. Testes
  em `scripts/__tests__/devArgs.test.ts` cobrindo `[]`, `--project x`, `--projects x,y`,
  `--all`, `--all --project x` (erro de exclusividade), `--projects` vazio (erro),
  `--preview`. **(Vitest)**
- **Task 2.2 — Resolver slugs:** ler o registry (reusar `readRegistry`/`listProjects` via
  um import dinâmico ou ler `projects.json`); `--all` → todos; validar `--projects`; em
  erro, imprimir slugs disponíveis e `process.exit(1)`.
- **Task 2.3 — Spawn por slug (dev):** para cada slug, `allocateDevPorts()` e spawnar
  `tsx watch server/index.ts` + `vite --port <web> --strictPort` com env
  `{ ...process.env, LOCALDRAWDB_PROJECT: slug, PORT, VITE_PORT, API_PORT }`. Aguardar
  `waitForPort(apiPort)` antes do Vite (como hoje).
- **Task 2.0 — Validação do pin no boot (recomendação da review final da F1):** hoje
  `pinnedSlug()` valida e lança, mas nada o chama no boot — um `LOCALDRAWDB_PROJECT`
  inválido só falha na 1ª requisição (como 500). A F2 deve chamar `pinnedSlug()` (ou um
  check equivalente) no startup em `server/index.ts` para falhar cedo e com mensagem clara,
  cumprindo a promessa da spec ("instância não sobe silenciosamente no projeto errado").
- **Task 2.4 — Meta multi + supervisão:** `.localdrawdb-dev.json` vira
  `{ instances: [{ slug, apiPort, webPort }], root }` (modo `shared` = 1 instância sem
  slug, retrocompat de leitura). `SIGINT/SIGTERM` mata todos os filhos e remove o meta;
  filho com exit ≠ 0 derruba o conjunto. Imprimir tabela `projeto | web | api`.
- **Smoke opcional:** subir `--projects alpha,beta` em data dir isolado e checar dois
  `web` respondendo (pode ser teste manual documentado).

## FASE 3 — Frontend fixado

> Detalhar ao iniciar a fase. Esboço:

- **Task 3.1 — Tipo de meta (`src/api.ts`):** acrescentar `pinnedProject?: string|null` e
  `pinnedProjectId?: string|null` ao tipo do `/api/meta` e à função que o busca.
- **Task 3.2 — `ProjectSwitcher` read-only:** nova prop `pinnedLabel?: string`; quando
  presente, renderiza `📌 {pinnedLabel}` (sem dropdown/botões). Caminho atual inalterado
  quando ausente.
- **Task 3.3 — `App.tsx`:** ao carregar meta, se `pinnedProject`, achar o nome do projeto
  na lista e passar `pinnedLabel` ao `ProjectSwitcher`; suprimir as ações de troca/CRUD.
- **Task 3.4 — Verificação no navegador:** `scripts/verify-per-project-ports.mjs`
  (playwright-core + Chrome do sistema, data dir isolado): subir instância com
  `LOCALDRAWDB_PROJECT`, abrir a web, asserir rótulo `📌` e ausência do dropdown; zero
  erros de console. (Ver memória `headless-verify-system-chrome`.)

## FASE 4 — Modo `--preview` (alavanca de memória)

> Detalhar ao iniciar a fase. Esboço:

- **Task 4.1 — Build único:** no `dev.mjs`, com `--preview`, rodar `vite build` uma vez
  antes do fan-out (ou reusar `dist/` existente).
- **Task 4.2 — Spawn estático por slug:** spawnar **só** o Fastify
  (`NODE_ENV=production tsx server/index.ts`, que já serve `dist/` via `@fastify/static`)
  com `LOCALDRAWDB_PROJECT` e `PORT`. Sem Vite.
- **Task 4.3 — Smoke:** `--all --preview` em data dir isolado sobe N Fastify estáticos;
  nenhum processo Vite no conjunto.

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
