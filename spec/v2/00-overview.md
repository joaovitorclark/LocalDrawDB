# Spec v2 — Visão geral (UX, visual e edição)

> Spec-driven development. Esta rodada evolui o LocalDrawDB (v1 entregue) para um
> produto **bonito e interativo**, com identidade **Seguros Unimed**.
> Specs irmãs: [`01-organize-records`](./01-organize-records.md),
> [`02-canvas-interactions`](./02-canvas-interactions.md), [`03-editing`](./03-editing.md).

## 1. Objetivo

Tornar o canvas tão fluido quanto dbdiagram.io/DrawDB/ChartDB: organizar o DBML com
um clique, preservar e amostrar `Records`, destacar relações ao passar o mouse,
mostrar cardinalidade (pé-de-galinha), permitir **criar relações arrastando** e
editar tabelas/colunas direto no diagrama — tudo com a paleta da marca.

## 2. Identidade visual (paleta Unimed)

Azul-marinho + verde. Variáveis CSS (`src/styles.css`):

| Token | Hex | Uso |
|-------|-----|-----|
| `--brand-navy` | `#13284b` | cabeçalho das tabelas, realce, marca |
| `--brand-navy-700` | `#1c3a6b` | hover/realce secundário do azul |
| `--brand-green` | `#00995d` | ações primárias, acento, arestas em destaque |
| `--brand-green-600` | `#43a047` | hover do verde |
| `--canvas-bg` | `#eef2f8` | fundo do canvas (azul muito claro) |
| `--ink` | `#13284b` | texto sobre claro |

Editor permanece tema escuro (contraste). Toolbar: fundo navy, botões com acento
verde no hover; botão primário (Organize) em verde.

## 3. Escopo (9 entregas)

1. Paleta Unimed em toda a UI.
2. Botão **Organize**: reordena DBML → Tables, Refs, Records (ver `01`).
3. **Records** preservados + **amostra** de dados (ver `01`).
4. **Hover-highlight** das relações (ver `02`).
5. **Crow's foot** (cardinalidade) (ver `02`).
6. **Cor por tabela** + **grupos visuais** (ver `03`).
7. **Painel de propriedades da coluna** (ver `03`).
8. **Renomear/adicionar coluna** inline (ver `03`).
9. **Drag-to-create** relações (ver `02`).

## 4. Princípios de arquitetura

- **DBML em texto é a fonte de verdade do documento.** Toda edição (drag-to-create,
  painel de coluna, rename) **escreve texto** e re-parseia. O canvas é projeção.
- **Estado efêmero/visual** (hover, seleção, cores, grupos colapsados) vive num
  **store Zustand** (`src/store/interaction.ts`), não no documento.
- **Cor por tabela e layout** ficam em `data/canvas.json` (apresentação), nunca no
  DBML — evita incompatibilidade do `@dbml/core`.
- **Composição de hooks** no canvas (inspirado no Structura): `useCanvasModel`,
  `useHoverHighlight`, `useDragToCreate`.

## 5. Critérios de aceite (gerais)

- **AC-V2-1**: A paleta Unimed aparece em toolbar, headers de tabela e arestas.
- **AC-V2-2**: Colar o exemplo do dbdiagram (com `Records`) **não quebra** o canvas.
- **AC-V2-3**: `npm run typecheck`, `npm test` e `npm run build` passam.
- **AC-V2-4**: Nenhuma cor/posição é gravada no DBML; tudo em `canvas.json`.
- Critérios específicos por feature estão nas specs `01`–`03`.

## 6. Não-objetivos desta rodada

- Colaboração em tempo real, múltiplas "views", assistente de IA.
- Undo/redo global e export Mermaid (stretch, fora do MVP v2).
