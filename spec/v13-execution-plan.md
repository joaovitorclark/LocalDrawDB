# v13 — Gestão de Projetos & Fix de Notas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mapear projetos criados na mão no launch, criar projetos via CLI e via UI (modo pinned), e corrigir o input de notas que descarta caracteres.

**Architecture:** Lógica canônica em `server/files.ts` (multi-projeto), reusada pelos scripts via tsx (`scripts/registry.mjs`). UI em React (`src/`), sem testes de componente no repo — lógica pura é extraída e testada, interação é verificada no browser.

**Tech Stack:** Node ESM scripts (`.mjs`), TypeScript (`tsx`), Fastify (server), React + Vite (frontend), Vitest (testes, environment=node).

## Global Constraints

- Mensagens/UI em português (pt-BR), seguindo o código existente.
- Reusar `createProject()`/`ensureRegistry()` de `server/files.ts` — não duplicar lógica de slug/registry.
- Scripts rodam via `node` puro; acesso a TS é via tsx (`node_modules/tsx/dist/cli.mjs`).
- `LOCALDRAWDB_DATA_DIR` deve ser respeitado em todo caminho (testes usam tmpdir).
- Vitest environment = node: **sem** testes de componente React (sem jsdom/RTL). UI verificada manualmente.
- Slugs derivam de `toSlug()`; colisões usam `uniqueSlug()` (já existentes).

---

## Task 1: Sync add-only do registry no launch (v13-01)

**Files:**
- Modify: `server/files.ts` (adicionar `syncRegistryWithDisk()`; ajustar `ensureRegistry()`)
- Test: `server/__tests__/projects.test.ts`

**Interfaces:**
- Consumes: `readRegistry()`, `writeRegistry()`, `projectSlugsOnDisk()`, `newId()`, type `ProjectMeta`, `migrateLegacy()` (já em `files.ts`).
- Produces: `export async function syncRegistryWithDisk(): Promise<string[]>` (retorna slugs adicionados). `ensureRegistry()` passa a chamar o sync no caminho "registry presente".

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `server/__tests__/projects.test.ts`:

```ts
describe('syncRegistryWithDisk — pastas criadas na mão', () => {
  it('adiciona ao registry pastas novas em projects/ (registry presente)', async () => {
    const { migrateLegacy, syncRegistryWithDisk, listProjects } = await importFiles();
    await migrateLegacy(); // cria default + projects.json
    await fs.mkdir(path.join(tmpDir, 'projects', 'vendas'), { recursive: true });

    const added = await syncRegistryWithDisk();
    expect(added).toEqual(['vendas']);

    const slugs = (await listProjects()).map((p) => p.slug).sort();
    expect(slugs).toEqual(['default', 'vendas']);
  });

  it('é idempotente quando nada novo no disco', async () => {
    const { migrateLegacy, syncRegistryWithDisk } = await importFiles();
    await migrateLegacy();
    expect(await syncRegistryWithDisk()).toEqual([]);
  });

  it('ensureRegistry com registry presente também faz o sync', async () => {
    const { migrateLegacy, ensureRegistry, listProjects } = await importFiles();
    await migrateLegacy();
    await fs.mkdir(path.join(tmpDir, 'projects', 'rh'), { recursive: true });

    await ensureRegistry();

    const slugs = (await listProjects()).map((p) => p.slug).sort();
    expect(slugs).toEqual(['default', 'rh']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/__tests__/projects.test.ts`
Expected: FAIL — `syncRegistryWithDisk is not a function`.

- [ ] **Step 3: Implementar `syncRegistryWithDisk` e ajustar `ensureRegistry`**

Em `server/files.ts`, adicionar logo após `ensureRegistry()`:

```ts
/**
 * syncRegistryWithDisk(): add-only. Adiciona ao registry toda pasta de
 * projects/ sem entrada correspondente. Nunca remove. Retorna os slugs
 * adicionados.
 */
export async function syncRegistryWithDisk(): Promise<string[]> {
  const reg = await readRegistry();
  const known = new Set(reg.projects.map((p) => p.slug));
  const slugs = await projectSlugsOnDisk();
  const added: string[] = [];
  const now = new Date().toISOString();
  for (const slug of slugs) {
    if (known.has(slug)) continue;
    reg.projects.push({ id: newId(), name: slug, slug, createdAt: now, updatedAt: now });
    added.push(slug);
  }
  if (added.length) {
    if (!reg.activeId) reg.activeId = reg.projects[0].id;
    await writeRegistry(reg);
  }
  return added;
}
```

Em `ensureRegistry()`, trocar a guarda de saída:

```ts
  const regExists = await fs.stat(registryPath()).then(() => true).catch(() => false);
  if (regExists) {
    await syncRegistryWithDisk();
    return;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/__tests__/projects.test.ts`
Expected: PASS (todos, incl. os 3 novos).

- [ ] **Step 5: Verificação manual do launcher**

Run:
```bash
TMPD=$(mktemp -d); LOCALDRAWDB_DATA_DIR="$TMPD" node scripts/ensureRegistry.ts >/dev/null 2>&1 || node node_modules/tsx/dist/cli.mjs scripts/ensureRegistry.ts; mkdir -p "$TMPD/projects/vendas"; LOCALDRAWDB_DATA_DIR="$TMPD" node scripts/dev.mjs --list; rm -rf "$TMPD"
```
Expected: a lista inclui `vendas`.

- [ ] **Step 6: Commit**

```bash
git add server/files.ts server/__tests__/projects.test.ts
git commit -m "feat(registry): sync add-only mapeia projetos criados na mão no launch"
```

---

## Task 2: Núcleo do CLI criar projeto (v13-02 A)

**Files:**
- Create: `scripts/createProject.ts` (entry tsx)
- Modify: `scripts/registry.mjs` (adicionar `createProjectCli`)
- Test: `scripts/__tests__/newProject.test.mjs`

**Interfaces:**
- Consumes: `createProject(name)` de `server/files.ts` (retorna `ProjectMeta` com `.slug`/`.name`); constantes `ROOT`/`TSX_CLI` de `registry.mjs`.
- Produces: `export function createProjectCli(name, dataDir?, opts?)` em `registry.mjs` — spawn síncrono de tsx; lança `Error` em status ≠ 0.

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/__tests__/newProject.test.mjs`:

```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectCli } from '../registry.mjs';

let tmpDir;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-new-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('createProjectCli', () => {
  it('cria o projeto no dataDir informado', async () => {
    createProjectCli('Meu Projeto', tmpDir);
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'));
    expect(reg.projects.some((p) => p.slug === 'meu-projeto')).toBe(true);
    const dirExists = await fs
      .stat(path.join(tmpDir, 'projects', 'meu-projeto'))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run scripts/__tests__/newProject.test.mjs`
Expected: FAIL — `createProjectCli` não exportado.

- [ ] **Step 3: Criar o entry tsx**

Criar `scripts/createProject.ts`:

```ts
// Entry tsx do launcher: cria um projeto reusando a lógica canônica de
// files.ts (respeita LOCALDRAWDB_DATA_DIR). Imprime o slug resultante.
import { createProject } from '../server/files.ts';

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Uso: createProject <nome>');
  process.exit(1);
}

const meta = await createProject(name);
console.log(`Projeto criado: ${meta.name} (slug: ${meta.slug})`);
```

- [ ] **Step 4: Adicionar `createProjectCli` em `registry.mjs`**

Adicionar a constante perto de `ENSURE_REGISTRY`:

```js
const CREATE_PROJECT = path.join(ROOT, 'scripts', 'createProject.ts');
```

E exportar a função (após `loadRegistry`):

```js
/**
 * Cria um projeto via CLI, reusando createProject() de files.ts (tsx).
 * @param {string} name
 * @param {string} [dataDir] Diretório de dados (default: env ou data/).
 * @param {{ tsxCli?: string, createScript?: string }} [opts]
 */
export function createProjectCli(name, dataDir = process.env.LOCALDRAWDB_DATA_DIR, opts = {}) {
  const tsxCli = opts.tsxCli ?? TSX_CLI;
  const script = opts.createScript ?? CREATE_PROJECT;
  const env = { ...process.env };
  if (dataDir) env.LOCALDRAWDB_DATA_DIR = dataDir;
  const res = spawnSync(process.execPath, [tsxCli, script, name], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    throw new Error(
      `Falha ao criar projeto "${name}"` + (res.error ? `\n${res.error.message}` : ''),
    );
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run scripts/__tests__/newProject.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/createProject.ts scripts/registry.mjs scripts/__tests__/newProject.test.mjs
git commit -m "feat(cli): núcleo createProjectCli + entry tsx createProject.ts"
```

---

## Task 3: Superfícies CLI — `./ldb new` e `npm run new` (v13-02 B/C)

**Files:**
- Create: `scripts/newProject.mjs`
- Modify: `scripts/dev.mjs` (import + branch `new`), `package.json` (script `new`)
- Test: `scripts/__tests__/newProject.test.mjs` (adicionar casos)

**Interfaces:**
- Consumes: `createProjectCli(name, dataDir?)` de `registry.mjs`.
- Produces: comando `./ldb new <nome>` e `npm run new -- <nome>`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `scripts/__tests__/newProject.test.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEW_SCRIPT = path.join(ROOT, 'scripts', 'newProject.mjs');

describe('npm run new (scripts/newProject.mjs)', () => {
  it('sem nome → exit 1', () => {
    const res = spawnSync(process.execPath, [NEW_SCRIPT], {
      env: { ...process.env, LOCALDRAWDB_DATA_DIR: tmpDir },
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
  });

  it('com nome → cria e exit 0', async () => {
    const res = spawnSync(process.execPath, [NEW_SCRIPT, 'Vendas RH'], {
      env: { ...process.env, LOCALDRAWDB_DATA_DIR: tmpDir },
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'));
    expect(reg.projects.some((p) => p.slug === 'vendas-rh')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run scripts/__tests__/newProject.test.mjs`
Expected: FAIL — `newProject.mjs` não existe (spawn status null/erro).

- [ ] **Step 3: Criar `scripts/newProject.mjs`**

```js
// `npm run new -- <nome>`: cria um projeto reusando o núcleo do CLI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectCli } from './registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.error('Uso: npm run new -- <nome>');
  process.exit(1);
}

const dataDir = process.env.LOCALDRAWDB_DATA_DIR ?? path.join(ROOT, 'data');
try {
  createProjectCli(name, dataDir);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
```

- [ ] **Step 4: Adicionar branch `new` em `scripts/dev.mjs`**

Trocar o import:

```js
import { loadRegistry, createProjectCli } from './registry.mjs';
```

Logo após `requireDeps();` (antes do `parseDevArgs`):

```js
// Subcomando `new <nome>`: cria projeto e sai (não sobe servidor).
if (process.argv[2] === 'new') {
  const name = process.argv.slice(3).join(' ').trim();
  if (!name) {
    console.error('Uso: ./ldb new <nome>');
    process.exit(1);
  }
  const dataDir = process.env.LOCALDRAWDB_DATA_DIR ?? path.join(ROOT, 'data');
  try {
    createProjectCli(name, dataDir);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}
```

- [ ] **Step 5: Adicionar script npm**

Em `package.json`, na seção `"scripts"`, adicionar:

```json
    "new": "node scripts/newProject.mjs",
```

- [ ] **Step 6: Rodar testes e verificar `./ldb new`**

Run: `npx vitest run scripts/__tests__/newProject.test.mjs`
Expected: PASS.

Run:
```bash
TMPD=$(mktemp -d); LOCALDRAWDB_DATA_DIR="$TMPD" ./ldb new "Projeto Teste"; LOCALDRAWDB_DATA_DIR="$TMPD" node scripts/dev.mjs --list; rm -rf "$TMPD"
```
Expected: imprime `Projeto criado: Projeto Teste (slug: projeto-teste)` e a lista mostra `projeto-teste`.

- [ ] **Step 7: Commit**

```bash
git add scripts/newProject.mjs scripts/dev.mjs package.json scripts/__tests__/newProject.test.mjs
git commit -m "feat(cli): ./ldb new <nome> e npm run new -- <nome>"
```

---

## Task 4: Fix do input de notas (v13-04)

**Files:**
- Modify: `src/records/RecordsPanel.tsx` (`NoteField`: estado local + commit no blur)
- Test: `src/dsl/__tests__/dbmlNotes.test.ts` (regressão de preservação de texto)

**Interfaces:**
- Consumes: `setTableOrRecordsNote(src, table, note)` de `src/dsl/edit.ts`.
- Produces: `NoteField` que comita no `onBlur`, não a cada tecla.

- [ ] **Step 1: Escrever o teste de regressão (DSL) que falha se a nota perder texto**

Adicionar a `src/dsl/__tests__/dbmlNotes.test.ts`:

```ts
import { setTableOrRecordsNote } from '../edit';

describe('setTableOrRecordsNote — preserva texto com espaços', () => {
  it('grava nota multi-palavra na Table', () => {
    const src = 'Table clientes {\n  id int\n}';
    const out = setTableOrRecordsNote(src, 'clientes', 'dimensão de clientes');
    expect(out).toContain("Note: 'dimensão de clientes'");
  });
});
```

- [ ] **Step 2: Rodar e ver o estado atual**

Run: `npx vitest run src/dsl/__tests__/dbmlNotes.test.ts`
Expected: PASS (o `edit.ts` já preserva espaços internos — este teste é guarda de regressão). Se FALHAR, a causa raiz inclui o `edit.ts` e deve ser corrigida antes de seguir.

- [ ] **Step 3: Refatorar `NoteField` para estado local com commit no blur**

Em `src/records/RecordsPanel.tsx`, trocar o import da linha 1:

```tsx
import { useEffect, useMemo, useState } from 'react';
```

Substituir a função `NoteField` (linhas ~14-37) por:

```tsx
function NoteField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  // Sincroniza com o valor externo (ex.: troca de tabela) só quando não está
  // focado — evita derrubar o que o usuário está digitando.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <label className="records-note-field">
      <span className="records-note-field__label">{label}</span>
      <textarea
        className="records-note-field__input"
        value={draft}
        placeholder={placeholder}
        rows={2}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (draft !== value) onChange(draft);
        }}
      />
    </label>
  );
}
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npx vitest run src/dsl/__tests__/dbmlNotes.test.ts && npm run typecheck`
Expected: PASS, typecheck exit 0.

- [ ] **Step 5: Verificação manual no browser (`/verify`)**

Subir o app, selecionar uma tabela, abrir "Dados (amostra)", digitar `dimensão de clientes` no campo "Nota da tabela":
- Os espaços e o cursor se mantêm enquanto digita (AC1).
- Ao sair do campo (blur), a nota é persistida (aparece no DBML / reabrindo o painel) (AC2).
- Trocar de tabela carrega a nota correta (AC3); nota de coluna idem (AC4).

- [ ] **Step 6: Commit**

```bash
git add src/records/RecordsPanel.tsx src/dsl/__tests__/dbmlNotes.test.ts
git commit -m "fix(notes): estado local no NoteField — commit no blur (não derruba caracteres)"
```

---

## Task 5: Criar projeto na UI em modo pinned (v13-03)

**Files:**
- Create: `src/projectMessages.ts` (mensagem pura testável)
- Modify: `src/ProjectSwitcher.tsx` (botão `+` no pill pinned), `src/App.tsx` (`handleCreateProject` pinned-aware)
- Test: `src/__tests__/projectMessages.test.ts`

**Interfaces:**
- Consumes: prop `onCreate(name)` e `handleCreate` (já em `ProjectSwitcher`); `pinnedProjectId`, `refreshProjects`, `setStatus`, `api.createProject` (já em `App.tsx`).
- Produces: `export function pinnedCreatedMessage(name: string): string`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/__tests__/projectMessages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pinnedCreatedMessage } from '../projectMessages';

describe('pinnedCreatedMessage', () => {
  it('inclui o nome e a instrução de reiniciar', () => {
    const msg = pinnedCreatedMessage('Vendas');
    expect(msg).toContain('Vendas');
    expect(msg).toContain('./ldb');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/projectMessages.test.ts`
Expected: FAIL — módulo `../projectMessages` não existe.

- [ ] **Step 3: Criar `src/projectMessages.ts`**

```ts
/** Aviso exibido após criar um projeto em modo pinned (instância fixada). */
export function pinnedCreatedMessage(name: string): string {
  return `Projeto "${name}" criado. Reinicie o dev (./ldb) para abri-lo na própria porta.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/projectMessages.test.ts`
Expected: PASS.

- [ ] **Step 5: Botão `+` no pill pinned do `ProjectSwitcher`**

Em `src/ProjectSwitcher.tsx`, substituir o bloco `if (pinnedLabel) { return (...) }` por:

```tsx
  if (pinnedLabel) {
    return (
      <div
        className="project-switcher project-switcher--pinned"
        title="Instância fixada neste projeto (porta dedicada)"
      >
        <span className="project-switcher__pin" aria-hidden="true">📌</span>
        <span className="project-switcher__name">{pinnedLabel}</span>
        <button
          type="button"
          className="project-switcher__action project-switcher__new-pinned"
          title="Novo projeto"
          onClick={handleCreate}
        >
          +
        </button>
      </div>
    );
  }
```

- [ ] **Step 6: Tornar `handleCreateProject` pinned-aware em `src/App.tsx`**

Substituir o corpo de `handleCreateProject` (linhas ~1046-1059) por:

```tsx
  const handleCreateProject = useCallback(
    async (name: string) => {
      try {
        await api.createProject(name);
        if (pinnedProjectId) {
          // Instância fixada: não troca; apenas avisa e atualiza a lista.
          await refreshProjects();
          setStatus(pinnedCreatedMessage(name));
          return;
        }
        const { activeId, projects: list } = await api.listProjects();
        setProjects(list);
        // Troca automaticamente para o novo projeto
        await switchProject(activeId !== currentProjectId ? activeId : list[list.length - 1]?.id ?? activeId);
      } catch (e: unknown) {
        setStatus(`Erro ao criar projeto: ${(e as Error)?.message ?? e}`);
      }
    },
    [currentProjectId, switchProject, pinnedProjectId, refreshProjects],
  );
```

Adicionar o import perto dos outros de `./` no topo de `App.tsx`:

```tsx
import { pinnedCreatedMessage } from './projectMessages';
```

- [ ] **Step 7: Estilo do botão `+` (opcional, casar visual)**

Localizar o CSS de `.project-switcher__action` (procurar em `src/**/*.css`) e adicionar regra leve se necessário:

```css
.project-switcher__new-pinned {
  margin-left: 6px;
}
```

Run: `grep -rn "project-switcher__action" src --include=*.css` para achar o arquivo. Se a regra base já der espaçamento aceitável, pode pular.

- [ ] **Step 8: Typecheck + verificação manual (`/verify`)**

Run: `npm run typecheck`
Expected: exit 0.

Subir em modo pinned (`LOCALDRAWDB_PROJECT=<slug> npm run dev:server` + vite, ou `./ldb <slug>`), clicar no `+` do pill, criar "Teste":
- Aparece o aviso de status com o nome e instrução de reiniciar (AC1).
- `data/projects/teste/` e entrada no registry criados (AC2).
- Em modo shared, criar ainda troca para o novo projeto (AC3).

- [ ] **Step 9: Commit**

```bash
git add src/projectMessages.ts src/__tests__/projectMessages.test.ts src/ProjectSwitcher.tsx src/App.tsx src/**/*.css
git commit -m "feat(ui): criar projeto pelo pill pinned (criar + avisar)"
```

---

## Task 6: Verificação final & suíte completa

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar toda a suíte**

Run: `npm test`
Expected: todos os arquivos passam (337 atuais + novos de v13).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Smoke do launcher**

Run:
```bash
TMPD=$(mktemp -d); LOCALDRAWDB_DATA_DIR="$TMPD" ./ldb new "Smoke"; mkdir -p "$TMPD/projects/manual-dir"; LOCALDRAWDB_DATA_DIR="$TMPD" node scripts/dev.mjs --list; rm -rf "$TMPD"
```
Expected: lista inclui `smoke` (via CLI) e `manual-dir` (via sync add-only).

---

## Self-Review (cobertura da spec)

- v13-01 → Task 1 (`syncRegistryWithDisk` + `ensureRegistry`). AC1/AC2/AC3 cobertos por testes + smoke. ✓
- v13-02 → Tasks 2 (núcleo) + 3 (superfícies). AC1/AC2/AC3/AC4 cobertos (`uniqueSlug` herda AC4). ✓
- v13-03 → Task 5. AC1/AC2/AC3 via verificação manual + teste da mensagem pura. ✓
- v13-04 → Task 4. Causa raiz (controlled textarea) corrigida no `NoteField`; AC via /verify + guarda de regressão no DSL. ✓
- Consistência de tipos: `createProjectCli(name, dataDir?, opts?)` usado igual em Tasks 2/3; `pinnedCreatedMessage(name)` definido na Task 5 Step 3 e usado no Step 6. ✓
