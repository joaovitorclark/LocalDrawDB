# Pesquisa de performance — tabelas/diagramas grandes

> Objetivo: deixar o app fluido com tabelas de **centenas de colunas** e diagramas
> com **muitas tabelas/arestas**, **sem mudar nenhuma funcionalidade**.
> Branch: `perf/large-tables-research`.

## Metodologia

- Mapeamento do pipeline `keystroke → parse → modelo → nós/arestas → React Flow`.
- Leitura de `Canvas.tsx`, `useCanvasNodes.ts`, `TableNode.tsx`, `edgeFocus.ts`,
  `App.tsx`, `parse.ts`, `validateModel.ts`, `lineLocate.ts`, `Editor.tsx`,
  `nodeMetrics.ts`, `store/interaction.ts`.
- Stack relevante: React **18.3** (recursos concorrentes disponíveis), React Flow **v11**.

## Como o custo escala hoje

Para uma tabela com `C` colunas e um diagrama com `T` tabelas / `E` arestas:

| Recurso | Custo atual |
|---------|-------------|
| DOM por tabela | `C` linhas + **2C** handles (normal), **4C** se linhagem de campos visível, **+8** portas L1 |
| Re-render de nós | **todos os T nós** a cada parse, seleção, troca de posição, toggle de camada |
| Re-render de arestas | **array inteiro** reconstruído em hover, seleção, coluna, toggles, parse |
| Parse | **síncrono a cada keystroke**, bloqueando a main thread |
| Hover/seleção | recomputa `related` O(focus × (refs + L1 + L2)) + `setNodes` em todos os nós |
| Validação | múltiplos `splitDbmlBlocks` do documento inteiro por keystroke |

Exemplo concreto: tabela com **C=500**, linhagem de campos ligada, portas L1 →
**~2008 handles** + 500 nós DOM em um único cartão. O React Flow registra cada
handle para roteamento de arestas; o custo de layout/medição explode.

## Gargalos priorizados (impacto → esforço)

### 1. React Flow renderiza tudo, sempre — `Canvas.tsx` (props do `<ReactFlow>`)
- **Sintoma:** todos os nós/arestas ficam no DOM mesmo fora da viewport.
- **Fix (sem mudar UX):** ativar `onlyRenderVisibleElements` (v11). Renderiza só o
  que está visível na viewport; pan/zoom continuam idênticos.
- **Impacto:** altíssimo em diagramas com muitas tabelas. **Esforço:** baixo (1 prop).

### 2. `TableNode` sem memo + 2–4 handles por coluna — `TableNode.tsx:11,116-172`
- **Sintoma:** qualquer update global re-renderiza todos os nós; cartões largos têm
  milhares de handles.
- **Fix:**
  - Envolver `TableNode`/`GroupNode` em `React.memo`.
  - Trocar as 5 subscriptions Zustand internas por seleção derivada estável
    (ex.: só `isSelected` desta coluna via selector, não o objeto inteiro).
  - **Virtualização de colunas** (windowing): renderizar apenas as linhas visíveis
    do cartão. Mesma aparência; só o que está na viewport vira DOM.
- **Impacto:** altíssimo em tabelas largas. **Esforço:** médio (memo: baixo; windowing: médio).

### 3. Parse síncrono por keystroke — `App.tsx:211`, `parse.ts:86-94`
- **Sintoma:** digitar em DBML grande trava a UI (parse + `@dbml/core` + `splitDbmlBlocks`).
- **Fix (sem mudar comportamento):**
  - `useDeferredValue(dbml)` para o parse, mantendo o editor responsivo (texto digita
    na hora; canvas atualiza logo em seguida).
  - Alternativa/conjunto: debounce de ~120–200ms só para o ramo de parse, preservando
    digitação imediata no CodeMirror.
- **Impacto:** alto. **Esforço:** baixo-médio.

### 4. Rebuild total de nós — `useCanvasNodes.ts:84-105`
- **Sintoma:** novo array + `groupNodes` a cada parse/posição/seleção; `data: t` novo
  força re-render de todos os `TableNode`.
- **Fix:**
  - Reusar referência de `data` quando a tabela não mudou (comparar por identidade do
    `TableView`/hash de colunas) para o `React.memo` do nó funcionar.
  - Separar "rebuild estrutural" (tabelas mudaram) de "update de seleção" (só flag),
    evitando recriar todos os nós quando só a seleção muda.
- **Impacto:** alto. **Esforço:** médio.

### 5. Rebuild total de arestas + `edgeHighlight` — `Canvas.tsx:325-425,410-419`
- **Sintoma:** array inteiro recriado em hover/seleção/toggle/parse; loop O(|L2|) + map O(|E|).
- **Fix:**
  - Aplicar highlight via `className`/CSS sem recriar o array de arestas em hover
    (atualizar só as props de estilo das arestas afetadas, ou mover dim/destaque para CSS
    baseado em classe do container).
  - Memoizar a construção base das arestas separada do highlight.
- **Impacto:** alto em diagramas densos. **Esforço:** médio.

### 6. `useHoverHighlight` toca todos os nós — `useCanvasNodes.ts:113-117`
- **Fix:** mover o esmaecimento de hover para **CSS** (classe no wrapper do canvas +
  `:hover`/data-attr), em vez de `setNodes` em todos os nós a cada enter/leave.
- **Impacto:** médio-alto. **Esforço:** médio.

### 7. `validateModel` + `lineOf*` re-tokenizam o documento — `validateModel.ts`, `lineLocate.ts:31-97`
- **Fix:** tokenizar `splitDbmlBlocks(dbml)` **uma vez** por parse e reusar (passar os
  blocos para `validateModel`/`Outline` em vez de cada função re-dividir o texto).
- **Impacto:** médio (por keystroke). **Esforço:** baixo-médio.

### 8. Context `actions` instável — `App.tsx:486-541`, `TableNode.tsx:12-24`
- **Fix:** estabilizar o objeto `actions` (deps mínimas / refs) para não invalidar todos
  os nós a cada parse; mover `tableMeta` para lookup memoizado por id.
- **Impacto:** médio. **Esforço:** médio.

### 9. MiniMap com muitos nós grandes — `Canvas.tsx:614`
- **Fix:** simplificar render do MiniMap (cor sólida por nó) ou permitir ocultar em
  diagramas muito grandes (toggle, mantendo default atual).
- **Impacto:** médio. **Esforço:** baixo.

## Plano em fases (cada fase é independente e testável)

**Fase 1 — ganhos rápidos, risco baixo**
1. `onlyRenderVisibleElements` no `<ReactFlow>` (#1).
2. `React.memo` em `TableNode` e `GroupNode` (#2 parcial).
3. `useDeferredValue`/debounce no ramo de parse (#3).
4. Tokenização única de blocos para validação/outline (#7).

**Fase 2 — re-render estrutural**
5. Reuso de `data` por identidade em `useCanvasNodes` + separar seleção de rebuild (#4).
6. Estabilizar `actions` context + `tableMeta` memoizado (#8).
7. Highlight de hover via CSS, sem `setNodes` global (#6).

**Fase 3 — escala extrema**
8. Virtualização de colunas no `TableNode` (#2 windowing).
9. Highlight de arestas sem recriar o array (#5).
10. MiniMap leve / opcional (#9).

## Restrição: zero mudança de funcionalidade

Todas as propostas preservam comportamento observável:
- `onlyRenderVisibleElements`, `React.memo`, `useDeferredValue`, windowing e
  highlight-via-CSS são **otimizações de render**, não de regras de negócio.
- Critério de aceite: a suíte atual (150 testes) continua verde; comportamento visual
  idêntico em pan/zoom/seleção/hover/edição.

## Como medir (antes/depois)

- Fixture sintética grande (gerar via script, **dados genéricos**): ex. 60 tabelas,
  algumas com 300–500 colunas, refs e L2 densos. Não versionar dados proprietários.
- React DevTools Profiler: comparar tempo de commit em (a) keystroke no editor,
  (b) hover de tabela, (c) seleção, (d) toggle de linhagem.
- Métrica-alvo: keystroke < 50ms de commit em DBML grande; hover/seleção < 16ms.

## Arquivos a tocar (por fase)

| Fase | Arquivos |
|------|----------|
| 1 | `src/canvas/Canvas.tsx`, `src/canvas/TableNode.tsx`, `src/canvas/GroupNode.tsx`, `src/App.tsx`, `src/dsl/validateModel.ts`, `src/dsl/lineLocate.ts` |
| 2 | `src/canvas/hooks/useCanvasNodes.ts`, `src/App.tsx`, `src/canvas/TableNode.tsx`, `src/styles.css` |
| 3 | `src/canvas/TableNode.tsx`, `src/canvas/Canvas.tsx`, `src/canvas/edgeFocus.ts` |
