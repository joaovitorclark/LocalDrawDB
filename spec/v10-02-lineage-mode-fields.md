# Spec v10-02 — Modo linhagem com campos + toggle relacionamentos

## Problema

Modo linhagem esconde colunas — impossível ligar campos L2. Linhas FK/Ref poluem o canvas. Sem toggle independente para constraints.

## Solução

### Toggles independentes (LayersPanel → Linhagem)

| Toggle | Aresta |
|--------|--------|
| Mostrar linhagem | L1 `lineage` (roxa tracejada) |
| **Mostrar relacionamentos** | FK `relation` (constraints) |
| Mostrar linhagem de campos | L2 `fieldLineage` |

### Store

- `relationsVisible: boolean`, `toggleRelationsVisible()`
- Ao entrar em `lineageMode`: `relationsVisible = false` (usuário pode religar)

### Canvas

- `relEdges` renderizam só quando `relationsVisible`
- Remover guard `!lineageMode` em `fieldEdges`
- Colunas sempre visíveis em `lineageMode` (`TableNode.tsx`)

### Layout

- Não forçar `compact: true` só por `lineageMode`

## Critérios de aceite

- **AC1:** Modo linhagem ON → colunas visíveis.
- **AC2:** Desmarcar "Mostrar relacionamentos" → linhas FK somem.
- **AC3:** Toggles linhagem e relacionamentos independentes.
- **AC4:** L2 funciona com lineageMode ativo.
- **AC5:** L1 editável pelas portas.
- **AC6:** Entrar em lineageMode desliga relacionamentos automaticamente.

## Arquivos

`TableNode.tsx`, `Canvas.tsx`, `useCanvasNodes.ts`, `LayersPanel.tsx`, `interaction.ts`, `styles.css`
