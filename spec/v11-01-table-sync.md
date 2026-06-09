# v11-01 — Sync tabelas DBML ↔ canvas

## Objetivo

Sincronização bidirecional ao criar/apagar tabelas entre editor DBML e canvas React Flow.

## A. Apagar tabela (canvas → DBML)

1. `removeTable(src, tableId)` em `src/dsl/edit.ts`:
   - Remove bloco `Table`
   - Remove refs que tocam a tabela (blocos `Ref` e FK inline `[ref: > …]`)
   - Remove entradas em `Lineage`, `LineageFields`, `TableGroup`, `LayerGroup`, `Records`
2. Canvas: `onNodesDelete` → `removeTable` via `onRemoveTable`
3. UI: botão **Apagar** no header de `TableNode`; **Apagar selecionadas** em `SelectionBar`; atalho Delete/Backspace
4. App: `handleRemoveTable`, `pruneCanvasState` (positions, colors, seleção)

## B. Criar tabela (editor → canvas)

1. `addTable` via `mutateDbml` + `prevDbmlRef`
2. Após criar: `focusTable` + posição default
3. Garbage collection: remover `positions`/`colors` de IDs inexistentes quando `activeModel.tables` muda

## C. UX parse inválido

- Banner no canvas quando `parsed.error`: *"Canvas mostra último modelo válido — corrija o DBML"*

## Critérios de aceite

- AC1: `Table` completa no editor → aparece no canvas
- AC2: Apagar bloco `Table` no editor → tabela some + `positions` limpo
- AC3: Botão/Delete no canvas remove tabela do DBML e refs relacionadas
- AC4: `+ Tabela` cria no DBML e foca no canvas
