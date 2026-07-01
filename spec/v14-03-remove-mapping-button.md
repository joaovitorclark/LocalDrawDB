# v14-03 — Remover botão de mapeamento (temporário)

**Ciclo:** v14 · **Backlog:** [03-remover-botao-mapeamento](backlog/03-remover-botao-mapeamento.md)

## Pedido

Remover **temporariamente** da UI o botão/entrada que abre o mapeamento campo→campo
(`FieldLineagePanel` / `LineageFields`). Vamos repensar essa feature no futuro — não é
exclusão da lógica, só tirar da interface por enquanto.

## Design

- Esconder a entrada que abre o `FieldLineagePanel` (e o próprio painel) na UI.
- **Manter** o parse e o render de blocos `LineageFields` já existentes: projetos que
  já têm esses blocos abrem e exibem sem erro.
- Não remover as funções de DSL (`addFieldLineageEntry`, etc.) nem o parsing — apenas
  desativar o ponto de entrada visual. Facilita reativar depois.

## Critérios de aceite

- AC1: A entrada/botão de mapeamento campo→campo não aparece mais na UI.
- AC2: Um projeto com blocos `LineageFields` existentes abre sem erro e os renderiza.
- AC3: Salvar/reabrir não apaga blocos `LineageFields` já presentes (round-trip).

## Fora de escopo

- Redesenho do mapeamento (futuro).
- Remoção das funções de DSL/parsing.

## Código relevante

- `src/canvas/FieldLineagePanel.tsx`
- `src/App.tsx` — render do `FieldLineagePanel` (~1332) e o controle que o abre.
