# Spec v8 — Autolayout sem sobreposição de tabelas

## Problema

Ao clicar **Organizar canvas** (`LayersPanel` → `handleAutolayout` em `App.tsx`), o layout usa
`autolayoutPositions` (dagre, `rankdir: LR`). Em modelos densos (ex.: autorização com ~40 tabelas),
nós ficam **sobrepostos**, reduzindo a utilidade do diagrama.

O botão **Organize** na toolbar reorganiza o **texto DBML** (`organize.ts`) — fora de escopo.

## Causas raiz

- Largura/altura fixas (230px) vs cartão real (títulos longos, muitas colunas, modo linhagem).
- Tabelas sem `@group` caem num único cluster dagre.
- Nós sem aresta FK/linhagem empilham no mesmo rank.
- Offset entre clusters usa largura fixa, não a do nó.
- Nenhum pós-processamento anti-colisão após `dagre.layout`.

## Objetivo

1. Nenhum par de tabelas visíveis com AABB sobreposto (margem 16px).
2. Máxima visibilidade do diagrama (clusters por grupo/camada).
3. Determinístico e rápido (< 500ms para ~50 tabelas).

## Comportamento

### Dimensões unificadas (`nodeMetrics.ts`)

- `nodeWidth` / `nodeHeight` — fonte única para autolayout e `useCanvasNodes`.

### Clustering

1. `TableGroup` (`@group`) se não vazio.
2. Senão `LayerGroup` / schema (`bronze`, `silver`).
3. Senão `default`.

Clusters lado a lado com gap dinâmico. Dentro do cluster, **componentes desconexos**
layout dagre separados, empilhados verticalmente.

### Dagre adaptativo

`nodesep` e `ranksep` escalam com `sqrt(nNodes)`.

### Pós-processamento `resolveOverlaps`

AABB + margem; desloca nó de menor grau; até 50 iterações.

### UX

`fitView({ padding: 0.12 })` após organizar.

## Critérios de aceite

- **AC1**: Modelo denso — zero overlap (teste AABB).
- **AC2**: Bronze e silver em clusters separados quando `@group` vazio no bronze.
- **AC3**: Tabelas sem FK no mesmo grupo não se sobrepõem.
- **AC4**: Modo linhagem usa altura compacta de forma consistente.
- **AC5**: Layout determinístico.
- **AC6**: ~50 tabelas < 500ms (Vitest).

## Implementação

- `src/canvas/nodeMetrics.ts`
- `src/canvas/autolayout.ts`
- `src/canvas/hooks/useCanvasNodes.ts`
- `src/App.tsx` + `src/canvas/Canvas.tsx` (`fitViewTrigger`)
- `src/canvas/__tests__/autolayout.test.ts`

## Relacionado

- `spec/v7-constraints-fk.md` — FK composta no import (separado).
