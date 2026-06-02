# Spec v3 — Canvas: fluidez e edição de relações

> Corrige bugs de canvas e adiciona delete/reconnect de relações, deixando a
> experiência fluida (refs: Structura, drawio, React Flow v11).

## 1. Problemas

1. **Aresta na coluna errada**: arestas não definem `sourceHandle`/`targetHandle`,
   então o React Flow ancora no primeiro handle (o `id`/topo) em vez da coluna do `Ref`.
2. **Snap-back ao arrastar**: a reconstrução dos nós depende de `hover`/`positions` e
   recria tudo, sobrescrevendo o arrasto; a persistência de posição é frágil.
3. **Sem ações de aresta**: não dá para deletar nem reconectar uma relação.

## 2. Requisitos e critérios de aceite

### A — Aresta ancora na coluna certa
- A aresta de `Ref: A.x > B.y` deve terminar no handle `t:y` (linha da coluna `y`) e
  sair do handle `s:x`.
- **AC-A1**: `Ref: loja.cliente.id > loja.a.ingestion_timestamp` conecta na linha
  `ingestion_timestamp`, não no `id`.

### B — Arrastar tabela é estável (sem snap-back)
- Arrastar um nó e soltar mantém a posição; passar o mouse, editar o DSL ou re-parsear
  **não** movem o nó.
- A nova posição é persistida em `data/canvas.json` e restaurada no reload.
- Undo/redo de posição aplica corretamente.
- **AC-B1**: após arrastar e depois passar o mouse + editar texto, o nó permanece no
  lugar; `canvas.json.positions[id]` reflete a posição nova.

### C — Deletar relação
- Clicar numa aresta a seleciona; **Delete/Backspace** a remove. Também um botão **✕**
  sobre a aresta (hover/seleção) remove.
- Remover a aresta remove o `Ref` correspondente do DBML (fonte de verdade).
- **AC-C1**: selecionar a aresta e apertar Delete faz o `Ref:` sumir do editor e a
  aresta sumir do canvas.

### D — Reconectar (relocar) relação
- Arrastar a ponta de uma aresta para outra coluna atualiza o `Ref` para a nova coluna.
- **AC-D1**: arrastar a ponta-alvo de `B.y` para `B.z` troca o `Ref` para `... > B.z`.

### E — Fluidez
- Aresta selecionada tem realce; cursor adequado; handles por coluna aparecem no hover.

## 3. Design

- **Handles nas arestas**: `Canvas.tsx` monta cada aresta com
  `sourceHandle='s:'+fromCol`, `targetHandle='t:'+toCol`, `data.endpoints`.
- **Gestão de nós (hooks)** — `src/canvas/hooks/`:
  - `useCanvasNodes(parsed, positions, relatedRef)`: efeito com deps
    `[parsed.tables, positions]`. Reconcilia: preserva posição de nós existentes
    (live, RF), aplica `positions[id]` em nós novos / mudança externa. `className`
    inicial via `relatedRef`.
  - `useHoverHighlight(related)`: efeito dep `[related]` que só atualiza `className`.
  - Persistência por `onNodeDragStop` → `onPositionsChange`.
- **Remover Ref** — `src/dsl/edit.ts#removeRef(src, fromTbl, fromCol, toTbl, toCol)`:
  tokeniza (`splitDbmlBlocks`), descarta o bloco `ref` que casa o par (qualquer
  direção, ignorando aspas), reaproveitando a comparação de `refExists`.
- **Delete**: `onEdgesDelete` + `deleteKeyCode={['Delete','Backspace']}` →
  `removeRef`. Botão ✕ via `EdgeLabelRenderer` em `RelationEdge.tsx`.
- **Reconnect**: `onEdgeUpdate(old, newConn)` → `removeRef(old)` + `appendRef(new)`.

## 4. Casos de borda

- Reconnect que gere relação duplicada ou self-loop: `appendRef` já ignora (no-op),
  e o `removeRef` do antigo não deve então remover sem adicionar → só aplicar a troca
  se a nova for válida; senão manter a antiga.
- `removeRef` não pode afetar outros `Ref` que compartilhem uma das pontas.
- Delete via Backspace só quando o canvas tem foco (RF cuida disso); digitar no editor
  não apaga relações.

## 5. Testes

- Vitest (`edit.removeRef`): remove o alvo, preserva os demais, re-parseável;
  `appendRef`→`removeRef` é round-trip.
- Headless (`scripts/verify-canvas-v3.mjs`): coluna certa (handle alvo),
  drag sem snap-back (+ canvas.json), delete por tecla, reconnect por arrasto da ponta.
