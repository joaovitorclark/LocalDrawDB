# Spec: Performance para tabelas/diagramas grandes (laterais pretas + jank)

> Spec de implementação derivada de `spec/perf-large-tables-research.md`.
> Restrição inegociável: **zero mudança de funcionalidade observável**; suíte de
> testes (150) verde; comportamento idêntico em pan/zoom/seleção/hover/edição.

## Problema
1. **Laterais pretas:** em diagramas grandes o app falha ao pintar e mostra áreas
   laterais pretas (provável: React Flow renderiza TODOS os nós/arestas no DOM —
   `onlyRenderVisibleElements` desativado — criando camadas GPU/SVG enormes que
   excedem limites de textura do browser; o que "vaza" por trás é o fundo escuro
   `--bg: #0f1419`).
2. **Jank:** parse síncrono por keystroke, rebuild total de nós/arestas, hover que
   chama `setNodes` em todos os nós, milhares de handles em tabelas largas.

## Metas / critérios de aceite
- Sem áreas pretas em diagramas grandes (pan/zoom em qualquer direção).
- Commit por keystroke < 50ms; hover/seleção < 16ms em DBML grande.
- 150 testes verdes; comportamento visual idêntico.

## Plano em fases (cada fase independente e testável)

### Fase 0 — Investigar e corrigir as laterais pretas (prioridade)
- **Reproduzir** com fixture grande (ver "Medição"); capturar em Chrome/Safari.
- **Correção principal:** ativar `onlyRenderVisibleElements` no `<ReactFlow>`
  (`src/canvas/Canvas.tsx`, props ~566–614) — reduz drasticamente o tamanho das
  camadas e tende a eliminar o estouro de textura GPU.
- **Defesa em profundidade (CSS/compositing):**
  - Garantir fundo sólido cobrindo o viewport mesmo quando o pane não pinta:
    revisar `.react-flow`, `.pane--canvas`, `.canvas-wrap` em `src/styles.css`
    (fundo `var(--canvas-bg)` no contêiner que sempre cobre a área visível).
  - Avaliar hints de compositing (`will-change`/`transform: translateZ(0)`) e os
    limites de tamanho do `.react-flow__viewport` transformado.
- **Aceite:** rolar/zoom em fixture grande sem áreas pretas em Chrome e Safari.

### Fase 1 — Ganhos rápidos, risco baixo
1. `onlyRenderVisibleElements` (já na Fase 0) — `Canvas.tsx`.
2. `React.memo` em `TableNode` e `GroupNode` — `src/canvas/TableNode.tsx`,
   `src/canvas/GroupNode.tsx`.
3. `useDeferredValue(dbml)` (ou debounce ~120–200ms) só no ramo de parse —
   `src/App.tsx:211`.
4. Tokenizar `splitDbmlBlocks(dbml)` **uma vez** por parse e reusar em
   `validateModel`/outline — `src/dsl/validateModel.ts`, `src/dsl/lineLocate.ts`.

### Fase 2 — Re-render estrutural
5. Reusar referência de `data` por identidade em `useCanvasNodes` e separar
   "rebuild estrutural" de "update de seleção" — `src/canvas/hooks/useCanvasNodes.ts`.
6. Estabilizar o context `actions` + `tableMeta` memoizado por id —
   `src/App.tsx:486–541`, `src/canvas/TableNode.tsx`.
7. Highlight de hover via **CSS** (classe no wrapper) em vez de `setNodes` global —
   `useCanvasNodes.ts:113–117`, `src/styles.css`.

### Fase 3 — Escala extrema
8. **Virtualização de colunas** no `TableNode` (windowing das linhas visíveis) —
   `src/canvas/TableNode.tsx`. Mesma aparência; só linhas na viewport viram DOM.
9. Highlight de arestas sem recriar o array (estilo/classe nas arestas afetadas) —
   `src/canvas/Canvas.tsx:325–425`, `src/canvas/edgeFocus.ts`.
10. MiniMap leve (cor sólida por nó) ou ocultável em diagramas muito grandes —
    `Canvas.tsx:614`.

## Medição (antes/depois)
- **Fixture sintética grande** via script (dados genéricos, não versionar dados
  proprietários): ex. 60 tabelas, algumas com 300–500 colunas, refs e L2 densos.
- React DevTools Profiler: tempo de commit em (a) keystroke, (b) hover, (c) seleção,
  (d) toggle de linhagem.
- Verificação visual das laterais pretas em Chrome e Safari (vide memória de verify
  com Chrome do sistema).

## Arquivos a tocar (por fase)
| Fase | Arquivos |
|------|----------|
| 0 | `src/canvas/Canvas.tsx`, `src/styles.css` |
| 1 | `src/canvas/Canvas.tsx`, `src/canvas/TableNode.tsx`, `src/canvas/GroupNode.tsx`, `src/App.tsx`, `src/dsl/validateModel.ts`, `src/dsl/lineLocate.ts` |
| 2 | `src/canvas/hooks/useCanvasNodes.ts`, `src/App.tsx`, `src/canvas/TableNode.tsx`, `src/styles.css` |
| 3 | `src/canvas/TableNode.tsx`, `src/canvas/Canvas.tsx`, `src/canvas/edgeFocus.ts` |

## Relação com a pesquisa
Esta spec mantém a numeração de gargalos de `spec/perf-large-tables-research.md` e
adiciona a **Fase 0** focada explicitamente no bug das laterais pretas.
