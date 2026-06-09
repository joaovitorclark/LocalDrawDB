# Spec v10-03 — Rename com propagação automática no editor

## Problema

Renomear tabela/campo no editor (texto livre) não atualiza refs, LineageFields, Records, indexes, nem canvas state.

## Solução

### Detector `detectRenames(oldDbml, newDbml)`

- **Tabela:** bloco Table com colunas ≥80% iguais → `oldId → newId`
- **Coluna:** mesma posição relativa, mesmo tipo → `oldCol → newCol`

### Funções em `edit.ts`

- `renameColumnAllRefs(src, table, oldCol, newCol)`
- `renameTableComplete` — `renameTable` + migrar `positions`/`colors`

### Pipeline App

```
userEdit → debounce 300ms → detectRenames → apply → setDbml
```

- Confirm dialog se ambíguo

## Critérios de aceite

- **AC1:** `Table bronze.foo` → `bronze.bar` propaga Ref, TableGroup, Lineage, LineageFields.
- **AC2:** Renomear coluna propaga Ref e LineageFields.
- **AC3:** `positions` e `colors` migram.
- **AC4:** Testes em `renameDetect.test.ts` e `renameRefs.test.ts`.

## Arquivos

`renameDetect.ts`, `edit.ts`, `blocks.ts`, `App.tsx`, `validateModel.ts`
