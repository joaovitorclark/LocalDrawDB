# Spec v10-04 — Rename de campo no canvas

## Problema

Renomear campo deve ser fácil; propagar refs; fallback ir ao DBML.

## Solução

### Fase A — Inline

- Campo **Nome** editável no `ColumnPanel`
- Duplo-clique em `TableNode` mantém input inline
- Ambos usam `renameColumnAllRefs` (v10-03)
- Atualizar `selectedColumn` e `focusedFieldMapping`

### Fase B — Ir ao DBML

- Botão "Editar no DBML" no `ColumnPanel` → `goToColumnLine`
- Alt+clique na coluna também dispara scroll

## Critérios de aceite

- **AC1:** Rename via ColumnPanel propaga refs.
- **AC2:** Funciona com lineageMode ON.
- **AC3:** "Editar no DBML" posiciona cursor na linha da coluna.

## Arquivos

`ColumnPanel.tsx`, `TableNode.tsx`, `App.tsx`, `Editor.tsx`

## Dependência

v10-03 (`renameColumnAllRefs`)
