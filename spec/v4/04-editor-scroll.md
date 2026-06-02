# Spec v4.4 — Barra de rolagem no editor (painel esquerdo)

## Problema

Com DBML longo (muitas tabelas/colunas), o painel do editor à esquerda não rola direito —
falta barra de rolagem confiável (vertical e, para linhas longas, horizontal), e o conteúdo
pode empurrar o layout.

## Comportamento

- O editor (CodeMirror) ocupa a altura do painel e **rola internamente**:
  - **Vertical:** quando há mais linhas que a altura visível.
  - **Horizontal:** quando há linhas longas (sem wrap).
- A barra de rolagem é visível/utilizável; o restante do layout (toolbar, canvas) não é
  empurrado pelo tamanho do conteúdo.

## Critérios de aceite

- **AC1:** abrir um DBML com ~40 tabelas → o painel esquerdo mostra barra de rolagem
  vertical e rola suavemente; toolbar e canvas permanecem fixos.
- **AC2:** uma linha muito longa gera rolagem horizontal dentro do editor (sem estourar o painel).

## Design

- `src/editor/Editor.tsx` / `src/styles.css`:
  - garantir o contêiner do painel (`.pane--editor` / `.editor`) com `min-height: 0`,
    `overflow: hidden` e o CodeMirror preenchendo 100% da altura;
  - `.cm-scroller { overflow: auto }` (vertical + horizontal). Confirmar que `basicSetup`
    não está com line-wrapping forçando layout; manter sem wrap para permitir scroll horizontal.
- Mudança pequena, majoritariamente CSS; sem novas dependências.

## Casos de borda

- Banner de erro de parse (`.editor__error`) deve continuar fixo no rodapé do painel sem
  cobrir a área de rolagem.
- Em telas pequenas, o painel mantém a rolagem sem quebrar o split editor/canvas.

## Testes

- Headless: carregar DBML grande; verificar `.cm-scroller.scrollHeight > clientHeight`
  e que `scrollTop` muda ao rolar; o container do canvas mantém posição/tamanho.
