# v14 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa.
> Steps usam checkbox (`- [ ]`).

**Goal:** Tornar o rename do DBML seguro (reconciliação no commit, não por keystroke) e
adicionar propagação mãe→filha com rolenames; remover o botão de mapeamento da UI.

**Architecture:** Digitar só atualiza buffer + render; a reconciliação roda no commit
(blur / Ctrl+S / trocar tabela). No commit, detecta renames sobre texto estável e, se
tocarem referências, mostra um modal. Para FKs filhas, a regra de rolename decide entre
propagar (herdado), manter (rolename travado) ou perguntar (divergente). Rolenames vivem
num bloco `Rolenames {}` no DBML.

**Tech Stack:** React, TypeScript, Vite, Vitest (env=node, sem jsdom/RTL — sem testes de
componente), CodeMirror (`@uiw/react-codemirror`), DBML.

## Global Constraints

- Strings de UI, comentários e mensagens de commit em **pt-BR**.
- Vitest roda em **env=node**: só testar lógica pura (DSL). Tarefas de UI verificam-se
  manualmente no navegador (ver memória `headless-verify-system-chrome`).
- DBML é a **fonte da verdade**: tudo que persiste estado tem de sobreviver a round-trip.
- Seguir padrões existentes em `src/dsl/` (funções puras `(src, ...args) => string`).
- Rodar a suíte com `npm test -- --run` e o build com `npm run build`.

---

## Fase A — Modo de edição commit-based (spec v14-01)

### Task 1: Núcleo de análise de renames no commit (`reconcile.ts`)

**Files:**
- Create: `src/dsl/reconcile.ts`
- Test: `src/dsl/__tests__/reconcile.test.ts`

**Interfaces:**
- Consumes: `detectRenames`, `DetectedRename` de `./renameDetect`; `splitDbmlBlocks` de
  `./blocks`.
- Produces:
  ```ts
  export type RenameImpact = { rename: DetectedRename; refCount: number; affectsRefs: boolean };
  export function countRenameRefs(src: string, rename: DetectedRename): number;
  export function analyzeRenames(committed: string, buffer: string): RenameImpact[];
  ```
  `countRenameRefs` conta quantas ocorrências fora da definição a propagação tocaria
  (Refs, grupos, FKs, records). `analyzeRenames` = `detectRenames` + impacto por item.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { analyzeRenames, countRenameRefs } from '../reconcile';

describe('countRenameRefs', () => {
  it('conta referências de uma coluna fora da definição', () => {
    const src = `Table bronze.a {
  old_col bigint [pk]
}
Table silver.b {
  x bigint [pk]
}
Ref: silver.b.x > bronze.a.old_col
`;
    const n = countRenameRefs(src, { kind: 'column', table: 'bronze.a', oldCol: 'old_col', newCol: 'new_col' });
    expect(n).toBe(1);
  });

  it('conta referências de tabela em Ref e TableGroup', () => {
    const src = `TableGroup g {
  loja.a
}
Table loja.a {
  id bigint [pk]
}
Ref: loja.b.id > loja.a.id
`;
    const n = countRenameRefs(src, { kind: 'table', oldId: 'loja.a', newId: 'loja.cliente' });
    expect(n).toBe(2); // membro do grupo + alvo do Ref (não conta o cabeçalho Table)
  });
});

describe('analyzeRenames', () => {
  it('não detecta nada quando o texto é igual', () => {
    expect(analyzeRenames('Table a {\n id int\n}', 'Table a {\n id int\n}')).toEqual([]);
  });

  it('marca affectsRefs quando o rename toca referências', () => {
    const prev = `Table bronze.a {
  old_col bigint [pk]
}
Ref: silver.b.x > bronze.a.old_col
`;
    const next = prev.replace('old_col', 'new_col');
    const out = analyzeRenames(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0].affectsRefs).toBe(true);
    expect(out[0].refCount).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dsl/__tests__/reconcile.test.ts`
Expected: FAIL ("Cannot find module '../reconcile'").

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/dsl/reconcile.ts
// Análise de renames para o commit: o que mudou e quantas referências cada rename toca.
import { detectRenames, type DetectedRename } from './renameDetect';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripQuotes = (s: string) => s.replace(/["`]/g, '').trim();

export type RenameImpact = { rename: DetectedRename; refCount: number; affectsRefs: boolean };

/** Conta ocorrências que a propagação tocaria, fora da definição da própria entidade. */
export function countRenameRefs(src: string, rename: DetectedRename): number {
  if (rename.kind === 'table') {
    const old = stripQuotes(rename.oldId);
    const re = new RegExp(`(?<![\\w.])${escapeRegex(old)}(?![\\w])`, 'g');
    const total = (src.match(re) ?? []).length;
    // desconta a definição (cabeçalho `Table old`)
    const headerRe = new RegExp(`Table\\s+"?${escapeRegex(old)}"?`, 'g');
    const headers = (src.match(headerRe) ?? []).length;
    return Math.max(0, total - headers);
  }
  // coluna: conta `table.oldCol` qualificado fora da própria tabela
  const t = stripQuotes(rename.table);
  const q = `${t}.${rename.oldCol}`;
  const re = new RegExp(`(?<![\\w.])${escapeRegex(q)}(?![\\w])`, 'g');
  return (src.match(re) ?? []).length;
}

/** detectRenames + impacto por item (texto estável, chamado no commit). */
export function analyzeRenames(committed: string, buffer: string): RenameImpact[] {
  return detectRenames(committed, buffer).map((rename) => {
    const refCount = countRenameRefs(buffer, rename);
    return { rename, refCount, affectsRefs: refCount > 0 };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- --run src/dsl/__tests__/reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dsl/reconcile.ts src/dsl/__tests__/reconcile.test.ts
git commit -m "feat(dsl): análise de renames para reconciliação no commit"
```

---

### Task 2: Hook de commit no editor (blur)

**Files:**
- Modify: `src/editor/Editor.tsx`

**Interfaces:**
- Produces: prop opcional `onCommit?: () => void` no `Editor`, disparada no blur do
  CodeMirror. Consumida pela Task 3.

- [ ] **Step 1: Adicionar a prop e o handler de blur**

Em `src/editor/Editor.tsx`, adicionar à `Props`:
```ts
  /** Disparado quando o editor perde foco (commit da edição). */
  onCommit?: () => void;
```
Incluir `onCommit` na desestruturação do componente. Adicionar uma extension de blur ao
`extensions` (manter as existentes):
```ts
import { EditorView } from '@codemirror/view'; // já importado
// ...
const onCommitRef = useRef(onCommit);
onCommitRef.current = onCommit;

const extensions = useMemo(
  () => [
    sql(),
    dbmlFoldExtension,
    cursorLineExtension((line0) => onCursorLineRef.current?.(line0)),
    EditorView.domEventHandlers({
      blur: () => { onCommitRef.current?.(); return false; },
    }),
  ],
  [],
);
```

- [ ] **Step 2: Build de tipos**

Run: `npm run build`
Expected: build passa (sem erros de TS).

- [ ] **Step 3: Commit**

```bash
git add src/editor/Editor.tsx
git commit -m "feat(editor): prop onCommit disparada no blur do editor"
```

---

### Task 3: Rewire do App — digitar não propaga; commit reconcilia

**Files:**
- Modify: `src/App.tsx` (`handleDbmlChange` ~497; adicionar `handleEditorCommit`;
  passar `onCommit` ao `<Editor>` ~1244; trocar tabela como gatilho).

**Interfaces:**
- Consumes: `analyzeRenames` (Task 1); `renameTable`, `renameColumnAllRefs`,
  `isCompleteTableId` (já importados).
- Produces: `handleEditorCommit()` que roda a reconciliação. A integração com o modal
  vem na Task 4 — aqui, sem refs, aplica direto; com refs, ainda aplica direto e
  registra TODO para o modal (substituído na Task 4).

- [ ] **Step 1: Tornar handleDbmlChange "burro" (só buffer)**

Substituir o corpo de `handleDbmlChange` para apenas atualizar o buffer e limpar o
timer de rename (remover a detecção por keystroke):
```ts
const handleDbmlChange = useCallback((next: string) => {
  setDbml(next);
}, []);
```
Remover o `renameTimer` e o uso de `detectRenames` daqui (a detecção migra pro commit).

- [ ] **Step 2: Adicionar handleEditorCommit**

```ts
const handleEditorCommit = useCallback(() => {
  const committed = prevDbmlRef.current;
  const buffer = dbmlRef.current; // ver Step 3: ref espelhando dbml
  if (committed === buffer) return;
  const impacts = analyzeRenames(committed, buffer);
  let out = buffer;
  for (const { rename } of impacts) {
    if (rename.kind === 'table' && isCompleteTableId(rename.oldId) && isCompleteTableId(rename.newId)) {
      out = renameTable(out, rename.oldId, rename.newId);
      migrateTableId(rename.oldId, rename.newId);
    } else if (rename.kind === 'column') {
      out = renameColumnAllRefs(out, rename.table, rename.oldCol, rename.newCol);
    }
  }
  prevDbmlRef.current = out;
  if (out !== buffer) {
    setDbml(out);
    setStatus(`Edição aplicada (${impacts.reduce((a, i) => a + i.refCount, 0)} refs atualizadas)`);
  } else {
    setStatus('');
  }
}, [migrateTableId]);
```

- [ ] **Step 3: Manter um ref do dbml atual**

Adicionar perto de `prevDbmlRef` (linha ~125):
```ts
const dbmlRef = useRef('');
```
E um efeito que espelha: `useEffect(() => { dbmlRef.current = dbml; }, [dbml]);`

- [ ] **Step 4: Ligar gatilhos**

No `<Editor ... onChange={handleDbmlChange} />` (~1244) adicionar `onCommit={handleEditorCommit}`.
No handler de seleção de tabela do canvas, chamar `handleEditorCommit()` antes de trocar
a tabela ativa (gatilho "trocar tabela").

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: passa.

- [ ] **Step 6: Verificação manual (navegador)**

Digitar um nome de coluna caractere a caractere → nada propaga. Clicar fora (blur) →
propaga uma vez e a barra de status mostra "Edição aplicada (N refs atualizadas)".
Apagar "preços" e digitar "valores": ao digitar "v" nada acontece; só no blur reconcilia.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(editor): reconciliação de renames no commit, não por keystroke"
```

---

### Task 4: Modal de confirmação de rename

**Files:**
- Create: `src/editor/RenameConfirmModal.tsx`
- Modify: `src/App.tsx` (estado do modal; `handleEditorCommit` abre o modal quando há
  `affectsRefs`; aplicar/cancelar).

**Interfaces:**
- Consumes: `RenameImpact` (Task 1).
- Produces: componente `RenameConfirmModal` com props
  `{ impacts: RenameImpact[]; onApply: () => void; onKeepSeparate: () => void; onClose: () => void }`.

- [ ] **Step 1: Criar o componente**

```tsx
// src/editor/RenameConfirmModal.tsx
import type { RenameImpact } from '../dsl/reconcile';

type Props = {
  impacts: RenameImpact[];
  onApply: () => void;
  onKeepSeparate: () => void;
  onClose: () => void;
};

function label(i: RenameImpact): string {
  const r = i.rename;
  return r.kind === 'table'
    ? `${r.oldId} → ${r.newId}`
    : `${r.table}.${r.oldCol} → ${r.newCol}`;
}

export function RenameConfirmModal({ impacts, onApply, onKeepSeparate, onClose }: Props) {
  const total = impacts.reduce((a, i) => a + i.refCount, 0);
  return (
    <div className="rename-modal__backdrop" onClick={onClose}>
      <div className="rename-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirmar renomeação</h3>
        <ul className="rename-modal__list">
          {impacts.map((i, idx) => <li key={idx}>{label(i)} — {i.refCount} referência(s)</li>)}
        </ul>
        <p className="rename-modal__hint">Atualiza {total} referência(s) no total.</p>
        <div className="rename-modal__actions">
          <button type="button" onClick={onApply}>Aplicar</button>
          <button type="button" onClick={onKeepSeparate}>Manter separado</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Estilo mínimo**

Em `src/styles.css`, adicionar `.rename-modal__backdrop` (overlay fixo centralizado) e
`.rename-modal` (caixa com `--bg`/borda). Seguir as variáveis de cor já existentes.

- [ ] **Step 3: Abrir o modal no commit com refs**

Em `App.tsx`, adicionar estado `const [pendingRename, setPendingRename] = useState<{impacts: RenameImpact[]; buffer: string; committed: string} | null>(null);`.
Em `handleEditorCommit`: se algum `impact.affectsRefs`, em vez de aplicar direto, setar
`pendingRename` e retornar. Os renames sem refs continuam aplicando direto.

- [ ] **Step 4: Aplicar / Manter separado**

`onApply`: roda a propagação (mesma lógica do loop da Task 3) e fecha o modal.
`onKeepSeparate`: aplica só o rename local (sem `renameTable`/`renameColumnAllRefs` nas
refs) — placeholder até a Task 10 plugar o rolename. Fecha o modal.
Renderizar `{pendingRename && <RenameConfirmModal .../>}` no JSX.

- [ ] **Step 5: Build + verificação manual**

Run: `npm run build`
Verificar: renomear uma tabela com refs → modal aparece listando o rename e a contagem;
"Aplicar" propaga; "Manter separado" não toca as refs.

- [ ] **Step 6: Commit**

```bash
git add src/editor/RenameConfirmModal.tsx src/App.tsx src/styles.css
git commit -m "feat(editor): modal de confirmação de rename no commit"
```

---

## Fase B — Rolename / propagação mãe→filha (spec v14-02)

### Task 5: Bloco `rolenames` no tokenizer

**Files:**
- Modify: `src/dsl/blocks.ts` (`BlockType`, `detectType`)
- Test: `src/dsl/__tests__/blocks.test.ts` (criar se não existir)

**Interfaces:**
- Produces: `splitDbmlBlocks` reconhece blocos `Rolenames { ... }` com `type: 'rolenames'`.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { splitDbmlBlocks } from '../blocks';

describe('splitDbmlBlocks — Rolenames', () => {
  it('reconhece bloco Rolenames como tipo próprio', () => {
    const src = `Rolenames {
  pedidos.cliente_id < clientes.id
}
`;
    const blocks = splitDbmlBlocks(src);
    expect(blocks.some((b) => b.type === 'rolenames')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dsl/__tests__/blocks.test.ts`
Expected: FAIL (tipo `'rolenames'` não existe / detecta como `comment`).

- [ ] **Step 3: Implementar**

Em `blocks.ts`: adicionar `'rolenames'` à união `BlockType`; em `detectType`, antes do
fallback, adicionar `if (/^Rolenames\b/i.test(trimmed)) return 'rolenames';`.

- [ ] **Step 4: Passar**

Run: `npm test -- --run src/dsl/__tests__/blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dsl/blocks.ts src/dsl/__tests__/blocks.test.ts
git commit -m "feat(dsl): tokenizer reconhece bloco Rolenames"
```

---

### Task 6: Parse do bloco + extração (DDL ignora)

**Files:**
- Modify: `src/dsl/dbmlClean.ts` (`parseRolenamesBlock`, `CUSTOM_TYPES`, `extractRecords`)
- Modify: `src/dsl/parse.ts` (`ParseResult.rolenames`, retorno)
- Test: `src/dsl/__tests__/rolenames.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ParsedRolename = { child: { table: string; column: string }; parent: { table: string; column: string } };
  export function parseRolenamesBlock(block: string): ParsedRolename[];
  ```
  `ParseResult` ganha `rolenames: ParsedRolename[]`. `cleanDbml` passa a remover o bloco
  (logo a exportação DDL não o emite).

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { parseRolenamesBlock, cleanDbml } from '../dbmlClean';
import { parseDbml } from '../parse';

describe('parseRolenamesBlock', () => {
  it('parseia entradas child < parent', () => {
    const block = `Rolenames {
  pedidos.cliente_id < clientes.id
}`;
    expect(parseRolenamesBlock(block)).toEqual([
      { child: { table: 'pedidos', column: 'cliente_id' }, parent: { table: 'clientes', column: 'id' } },
    ]);
  });
});

describe('cleanDbml / parseDbml — Rolenames', () => {
  it('remove o bloco Rolenames do DBML limpo (DDL ignora)', () => {
    const src = `Table clientes {
  id int [pk]
}
Rolenames {
  pedidos.cliente_id < clientes.id
}`;
    expect(cleanDbml(src)).not.toMatch(/Rolenames/i);
  });

  it('expõe rolenames no ParseResult', () => {
    const src = `Table clientes {
  id int [pk]
}
Rolenames {
  pedidos.cliente_id < clientes.id
}`;
    expect(parseDbml(src).rolenames).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dsl/__tests__/rolenames.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `dbmlClean.ts`:
```ts
export type ParsedRolename = {
  child: { table: string; column: string };
  parent: { table: string; column: string };
};

export function parseRolenamesBlock(block: string): ParsedRolename[] {
  const out: ParsedRolename[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || /^Rolenames\s*\{/i.test(line) || line === '}') continue;
    const m = /^([^\s<]+)\s*<\s*([^\s]+)/.exec(line);
    if (!m) continue;
    const c = splitTableColumn(m[1]);
    const p = splitTableColumn(m[2]);
    if (c && p) out.push({ child: c, parent: p });
  }
  return out;
}
```
Adicionar `'rolenames'` ao `CUSTOM_TYPES`. Em `extractRecords`, acumular um array
`rolenames` (igual a `lineageFields`): no `else if (b.type === 'rolenames') rolenames.push(...parseRolenamesBlock(b.text));`
e devolvê-lo no retorno.
Em `parse.ts`: somar `rolenames` ao tipo `ParseResult`, ao destructuring de
`extractRecords` e aos dois `return` (sucesso e erro → `rolenames: []`).

- [ ] **Step 4: Passar**

Run: `npm test -- --run src/dsl/__tests__/rolenames.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dsl/dbmlClean.ts src/dsl/parse.ts src/dsl/__tests__/rolenames.test.ts
git commit -m "feat(dsl): parse do bloco Rolenames e exposição no ParseResult"
```

---

### Task 7: Mutações add/remove rolename

**Files:**
- Modify: `src/dsl/edit.ts`
- Test: `src/dsl/__tests__/rolenameEdit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function addRolename(src: string, child: {table:string;column:string}, parent: {table:string;column:string}): string;
  export function removeRolename(src: string, child: {table:string;column:string}): string;
  ```
  Cria o bloco `Rolenames {}` se não existir; idempotente (não duplica).

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { addRolename, removeRolename } from '../edit';

const child = { table: 'pedidos', column: 'cliente_id' };
const parent = { table: 'clientes', column: 'id' };

describe('addRolename', () => {
  it('cria o bloco e adiciona a entrada', () => {
    const out = addRolename('Table clientes {\n  id int [pk]\n}\n', child, parent);
    expect(out).toMatch(/Rolenames\s*\{/);
    expect(out).toContain('pedidos.cliente_id < clientes.id');
  });

  it('é idempotente', () => {
    const a = addRolename('', child, parent);
    const b = addRolename(a, child, parent);
    expect((b.match(/pedidos\.cliente_id/g) ?? []).length).toBe(1);
  });
});

describe('removeRolename', () => {
  it('remove a entrada (e o bloco se ficar vazio)', () => {
    const a = addRolename('', child, parent);
    const out = removeRolename(a, child);
    expect(out).not.toMatch(/pedidos\.cliente_id/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dsl/__tests__/rolenameEdit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar (seguir o padrão de addLineageEntry em edit.ts)**

```ts
export function addRolename(
  src: string,
  child: { table: string; column: string },
  parent: { table: string; column: string },
): string {
  const line = `  ${child.table}.${child.column} < ${parent.table}.${parent.column}`;
  const blocks = splitDbmlBlocks(src);
  const block = blocks.find((b) => b.type === 'rolenames');
  const needle = `${child.table}.${child.column} <`;
  if (block) {
    if (block.text.includes(needle)) return src;
    const close = block.text.lastIndexOf('}');
    if (close >= 0) {
      const newText = block.text.slice(0, close) + `${line}\n` + block.text.slice(close);
      return src.replace(block.text, newText);
    }
  }
  return `${src.replace(/\n+$/, '')}\n\nRolenames {\n${line}\n}\n`.replace(/^\n+/, '');
}

export function removeRolename(src: string, child: { table: string; column: string }): string {
  const blocks = splitDbmlBlocks(src);
  const block = blocks.find((b) => b.type === 'rolenames');
  if (!block) return src;
  const prefix = `${child.table}.${child.column} <`;
  const updated = block.text.split('\n').filter((l) => !l.trim().startsWith(prefix)).join('\n');
  if (!/\S/.test(updated.replace(/Rolenames\s*\{/i, '').replace('}', ''))) {
    return src.replace(block.text, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  return src.replace(block.text, updated);
}
```

- [ ] **Step 4: Passar**

Run: `npm test -- --run src/dsl/__tests__/rolenameEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dsl/edit.ts src/dsl/__tests__/rolenameEdit.test.ts
git commit -m "feat(dsl): mutações addRolename/removeRolename no bloco Rolenames"
```

---

### Task 8: Classificação das FKs filhas (regra de rolename)

**Files:**
- Create: `src/dsl/rolename.ts`
- Test: `src/dsl/__tests__/rolenameClassify.test.ts`

**Interfaces:**
- Consumes: `splitDbmlBlocks` (`./blocks`); `parseRolenamesBlock`, `splitTableColumn`
  (`./dbmlClean`); `getColumnSettings` (`./edit`).
- Produces:
  ```ts
  export type FkChild = { table: string; column: string };
  export type RolenameDecision = { child: FkChild; kind: 'inherited' | 'rolename' | 'divergent' };
  export function classifyChildFks(src: string, parentTable: string, parentColOld: string): RolenameDecision[];
  ```
  Acha FKs filhas que apontam para `parentTable.parentColOld` (via blocos `Ref` e inline
  `[ref: > ...]`) e classifica: `inherited` (nome == parentColOld), `rolename` (listada
  em Rolenames), `divergent` (nome difere e não há rolename).

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { classifyChildFks } from '../rolename';

describe('classifyChildFks', () => {
  const base = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int [pk]
  id_cliente int
}
Ref: pedidos.id_cliente > clientes.id
`;

  it('classifica FK herdada quando o nome bate', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int
}
Ref: pedidos.id > clientes.id
`;
    const out = classifyChildFks(src, 'clientes', 'id');
    expect(out.find((d) => d.child.table === 'pedidos')?.kind).toBe('inherited');
  });

  it('classifica como divergente quando o nome difere sem rolename', () => {
    const out = classifyChildFks(base, 'clientes', 'id');
    expect(out.find((d) => d.child.column === 'id_cliente')?.kind).toBe('divergent');
  });

  it('classifica como rolename quando listado no bloco', () => {
    const src = base + `Rolenames {
  pedidos.id_cliente < clientes.id
}
`;
    const out = classifyChildFks(src, 'clientes', 'id');
    expect(out.find((d) => d.child.column === 'id_cliente')?.kind).toBe('rolename');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dsl/__tests__/rolenameClassify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/dsl/rolename.ts
// Classifica FKs filhas de uma chave-mãe: herdada, rolename (travada) ou divergente.
import { splitDbmlBlocks } from './blocks';
import { parseRolenamesBlock, splitTableColumn } from './dbmlClean';

export type FkChild = { table: string; column: string };
export type RolenameDecision = { child: FkChild; kind: 'inherited' | 'rolename' | 'divergent' };

const strip = (s: string) => s.replace(/["`]/g, '').trim();

/** Coleta FKs (child.col -> parent.col) de blocos Ref e refs inline. */
function collectFks(src: string): { child: FkChild; parent: FkChild }[] {
  const out: { child: FkChild; parent: FkChild }[] = [];
  const blocks = splitDbmlBlocks(src);
  for (const b of blocks) {
    if (b.type === 'ref') {
      const m = /Ref:?\s*([^\s<>-]+)\s*[<>-]+\s*([^\s\[]+)/i.exec(b.text.replace(/["`]/g, ''));
      if (m) {
        const a = splitTableColumn(m[1]);
        const c = splitTableColumn(m[2]);
        if (a && c) out.push({ child: a, parent: c });
      }
    }
    if (b.type === 'table') {
      const tbl = strip(b.name ?? '');
      for (const line of b.text.split('\n')) {
        const fm = /^\s*("?[A-Za-z_][\w]*"?)\s+.*\[.*ref:\s*>\s*([^\s,\]]+)/i.exec(line);
        if (fm) {
          const p = splitTableColumn(fm[2].replace(/["`]/g, ''));
          if (p) out.push({ child: { table: tbl, column: strip(fm[1]) }, parent: p });
        }
      }
    }
  }
  return out;
}

export function classifyChildFks(src: string, parentTable: string, parentColOld: string): RolenameDecision[] {
  const pt = strip(parentTable);
  const pc = strip(parentColOld);
  const rolenames = splitDbmlBlocks(src)
    .filter((b) => b.type === 'rolenames')
    .flatMap((b) => parseRolenamesBlock(b.text));
  const isRolename = (c: FkChild) =>
    rolenames.some((r) => strip(r.child.table) === strip(c.table) && strip(r.child.column) === strip(c.column));

  return collectFks(src)
    .filter((fk) => strip(fk.parent.table) === pt && strip(fk.parent.column) === pc)
    .map((fk) => {
      const child = { table: strip(fk.child.table), column: strip(fk.child.column) };
      if (isRolename(child)) return { child, kind: 'rolename' as const };
      if (child.column === pc) return { child, kind: 'inherited' as const };
      return { child, kind: 'divergent' as const };
    });
}
```

- [ ] **Step 4: Passar**

Run: `npm test -- --run src/dsl/__tests__/rolenameClassify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dsl/rolename.ts src/dsl/__tests__/rolenameClassify.test.ts
git commit -m "feat(dsl): classifica FKs filhas (herdada/rolename/divergente)"
```

---

### Task 9: Propagação respeitando rolenames

**Files:**
- Create: `src/dsl/propagateKeyRename.ts`
- Test: `src/dsl/__tests__/propagateKeyRename.test.ts`

**Interfaces:**
- Consumes: `classifyChildFks` (Task 8); `renameColumn`, `renameColumnAllRefs` (`./edit`).
- Produces:
  ```ts
  export function propagateKeyRename(src: string, parentTable: string, oldCol: string, newCol: string): string;
  ```
  Renomeia a coluna-chave na mãe, atualiza todos os alvos de ref para `newCol`, renomeia
  as FKs filhas `inherited` para `newCol`, e deixa intactas as `rolename`/`divergent`.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { propagateKeyRename } from '../propagateKeyRename';

describe('propagateKeyRename', () => {
  it('renomeia a chave e a FK filha herdada', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int
}
Ref: pedidos.id > clientes.id
`;
    const out = propagateKeyRename(src, 'clientes', 'id', 'codigo');
    expect(out).toContain('codigo int [pk]');
    expect(out).toContain('pedidos.codigo'); // FK herdada acompanhou
    expect(out).toContain('clientes.codigo');
  });

  it('mantém a FK rolename, atualizando só o alvo do ref', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id_cliente int
}
Ref: pedidos.id_cliente > clientes.id
Rolenames {
  pedidos.id_cliente < clientes.id
}
`;
    const out = propagateKeyRename(src, 'clientes', 'id', 'codigo');
    expect(out).toContain('id_cliente int'); // nome próprio preservado
    expect(out).toContain('clientes.codigo'); // alvo do ref atualizado
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dsl/__tests__/propagateKeyRename.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/dsl/propagateKeyRename.ts
import { classifyChildFks } from './rolename';
import { renameColumn } from './edit';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renomeia a coluna-chave na mãe e propaga só para FKs herdadas; rolename/divergente ficam. */
export function propagateKeyRename(src: string, parentTable: string, oldCol: string, newCol: string): string {
  const decisions = classifyChildFks(src, parentTable, oldCol);

  // 1) renomeia a coluna na mãe (definição)
  let out = renameColumn(src, parentTable, oldCol, newCol);

  // 2) atualiza alvos de ref parentTable.oldCol -> parentTable.newCol (Refs + inline)
  const pt = parentTable.replace(/["`]/g, '').trim();
  const oldQ = `${pt}.${oldCol}`;
  const newQ = `${pt}.${newCol}`;
  out = out.replace(new RegExp(`(?<![\\w.])${escapeRegex(oldQ)}(?![\\w])`, 'g'), newQ);

  // 3) FKs filhas herdadas acompanham o nome
  for (const d of decisions) {
    if (d.kind !== 'inherited') continue;
    out = renameColumn(out, d.child.table, oldCol, newCol);
    const childOldQ = `${d.child.table}.${oldCol}`;
    const childNewQ = `${d.child.table}.${newCol}`;
    out = out.replace(new RegExp(`(?<![\\w.])${escapeRegex(childOldQ)}(?![\\w])`, 'g'), childNewQ);
  }
  return out;
}
```

- [ ] **Step 4: Passar**

Run: `npm test -- --run src/dsl/__tests__/propagateKeyRename.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dsl/propagateKeyRename.ts src/dsl/__tests__/propagateKeyRename.test.ts
git commit -m "feat(dsl): propagação de rename de chave respeitando rolenames"
```

---

### Task 10: Integrar rolename no modal de commit

**Files:**
- Modify: `src/App.tsx` (usar `classifyChildFks`/`propagateKeyRename` quando o rename de
  coluna é de uma chave-mãe; "Manter separado" grava rolename via `addRolename`).
- Modify: `src/editor/RenameConfirmModal.tsx` (listar FKs filhas divergentes, se houver).

**Interfaces:**
- Consumes: `propagateKeyRename`, `classifyChildFks` (Tasks 8–9); `addRolename` (Task 7).

- [ ] **Step 1: No onApply, usar propagateKeyRename para renames de coluna**

No `onApply` do modal, para cada impacto `kind === 'column'`, usar
`propagateKeyRename(out, r.table, r.oldCol, r.newCol)` no lugar de `renameColumnAllRefs`
quando `classifyChildFks(buffer, r.table, r.oldCol)` retornar alguma filha. Caso
contrário, manter `renameColumnAllRefs`.

- [ ] **Step 2: No onKeepSeparate, gravar rolenames das filhas divergentes**

Para cada filha `divergent` das colunas renomeadas, chamar
`out = addRolename(out, d.child, { table: r.table, column: r.newCol })` e renomear só a
definição da mãe (`renameColumn`), sem tocar os nomes das filhas.

- [ ] **Step 3: Build + verificação manual**

Run: `npm run build`
Cenários: (a) renomear `clientes.id`→`codigo` com FK filha de mesmo nome → "Aplicar"
renomeia a filha junto; (b) FK com nome próprio divergente → "Manter separado" cria
entrada em `Rolenames` e a filha não muda; reabrir o projeto mantém o bloco.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/editor/RenameConfirmModal.tsx
git commit -m "feat(rolename): propagação mãe→filha e anuência via modal de commit"
```

---

## Fase C — Remover botão de mapeamento (spec v14-03)

### Task 11: Esconder a entrada do FieldLineagePanel

**Files:**
- Modify: `src/App.tsx` (não renderizar a entrada/painel de mapeamento campo→campo).

**Interfaces:** nenhuma nova. Parsing/render de `LineageFields` existentes permanece.

- [ ] **Step 1: Remover o ponto de entrada da UI**

Em `App.tsx`, comentar/remover o render do `<FieldLineagePanel .../>` (~1332) e o
controle (botão/toggle) que o abre. **Não** remover handlers de DSL nem o parsing — só a
entrada visual. Deixar um comentário `// mapeamento campo→campo escondido (v14-03)`.

- [ ] **Step 2: Build + verificação manual**

Run: `npm run build`
Verificar: o botão/painel de mapeamento não aparece; um projeto com blocos
`LineageFields` existentes abre sem erro e os renderiza; salvar/reabrir preserva os blocos.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): esconde botão de mapeamento campo→campo (temporário)"
```

---

## Verificação final

- [ ] `npm test -- --run` — toda a suíte passa.
- [ ] `npm run build` — build limpo.
- [ ] Verificação manual no navegador dos ACs de v14-01, v14-02 e v14-03.
- [ ] Atualizar `spec/backlog/README.md` movendo 1–3 para "concluído" (ou abrir PR).

## Cobertura spec → task (self-review)

- v14-01 AC1 (não propaga digitando) → Task 3. AC2/AC3 (modal aplicar/separar) →
  Task 4. AC4 (não toca vizinhos) → Task 1+3 (detecção sobre texto estável). AC5
  (evento único + feedback) → Task 3/4. AC6 (trocar tabela) → Task 3.
- v14-02 AC1 (herdada acompanha) → Task 9. AC2 (rolename intacta) → Task 9. AC3
  (divergente → manter separado grava) → Task 8+10. AC4 (round-trip) → Task 6+7. AC5
  (DDL ignora) → Task 6.
- v14-03 AC1–AC3 → Task 11.
