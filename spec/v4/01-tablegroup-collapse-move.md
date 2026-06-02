# Spec v4.1 — TableGroup: colapsar/expandir e mover junto

> Exemplos genéricos (pipeline medallion): grupos `bronze`, `staging`, `mart`.

## Problema

Hoje um `TableGroup` é só uma **caixa decorativa** atrás das tabelas
(`GroupNode`, `pointer-events:none`, `draggable:false`). Não dá para **recolher** o
grupo nem **mover** o grupo inteiro de uma vez — com muitos grupos/tabelas o canvas
fica difícil de organizar.

## Comportamento

### Colapsar / expandir
- O rótulo do grupo ganha um botão de toggle (▾/▸).
- **Colapsado:** os nós-membro e as arestas internas ao grupo **somem**; o grupo vira
  um bloco compacto mostrando o nome + contagem (`mart · 4 tabelas`). Arestas que
  cruzam a fronteira (membro ↔ tabela de fora) conectam-se à borda do bloco colapsado.
- **Expandido:** restaura tabelas/arestas nas posições anteriores.
- Estado persistido em `canvas.json.collapsedGroups: string[]` (nomes dos grupos).

### Mover o grupo inteiro
- O cabeçalho do grupo passa a ser **arrastável**. Arrastar aplica o **mesmo delta** a
  todas as tabelas-membro, preservando as posições relativas.
- Ao soltar, as novas posições dos membros são persistidas em `canvas.json.positions`.

## Critérios de aceite

- **AC1:** clicar no toggle de `mart` esconde suas tabelas e as arestas internas; a caixa
  vira um bloco compacto com a contagem; clicar de novo restaura tudo.
- **AC2:** arrastar o cabeçalho de `staging` move todas as suas tabelas juntas; as
  posições relativas entre elas não mudam; recarregar mantém as novas posições.
- **AC3:** colapso e posições sobrevivem ao reload (persistidos em `canvas.json`).

## Design

- `src/canvas/GroupNode.tsx`: adicionar botão de colapso e (quando colapsado) o resumo;
  tornar o cabeçalho arrastável (`draggable` no nó de grupo, ou handle de arraste).
- `src/canvas/hooks/useCanvasNodes.ts`:
  - `groupNodes(...)` recebe `collapsedGroups`; para grupo colapsado, emite **um** nó
    compacto e **omite** os nós-membro; senão, comportamento atual.
  - mover: ao arrastar o nó de grupo, calcular delta e atualizar `positions` de todos os
    membros (via callback do Canvas, semelhante ao `onNodeDragStop` atual).
- `src/canvas/Canvas.tsx`: `onNodeDragStop`/`onNodeDrag` trata nós `type==='group'`
  (move-as-unit) e nós de tabela (atual). Filtrar membros de grupos colapsados ao montar
  nós/arestas.
- `src/store/interaction.ts` **ou** `canvas.json`: colapso é **persistente** →
  `canvas.json.collapsedGroups`; ações expostas via `CanvasActions` (`actions.ts`).
- `src/api.ts CanvasState`: novo campo `collapsedGroups?: string[]`.

## Casos de borda

- Grupo com 1 tabela: colapso ainda funciona (bloco compacto com "1 tabela").
- Arrastar grupo não deve disparar criação de relação nem seleção de coluna.
- Mover grupo recolhido move logicamente os membros (posições atualizadas) mesmo ocultos.

## Testes

- Vitest: util de cálculo de delta de movimento do grupo; serialização de `collapsedGroups`.
- Headless: colapsar/expandir esconde/restaura membros; arrastar grupo move o conjunto;
  reload preserva.
