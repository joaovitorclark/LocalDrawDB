# Spec: Rebranding visual (fase final)

> **Pré-requisito:** só iniciar **após** as Specs de multi-projeto e dbt concluídas
> (funcionalidade primeiro). Abordagem **conservadora, incremental e reversível** — o
> usuário gosta do estado atual e tem receio de quebrá-lo.

## Problema

O app lê como **dbdiagram.io** por escolhas **estruturais**, não só de cor:
- Card branco + header navy nos nós (`src/styles.css` ~404-607, `TableNode.tsx`).
- Crow's foot nas relações (`src/canvas/EdgeMarkers.tsx`).
- Handles de coluna verdes; fundo de canvas claro (`--canvas-bg: #eef2f8`).
- Cantos arredondados 8px por toda parte; bordas finas cinza (`#c4ccd6`).

Objetivo: **divergir** do dbdiagram **preservando** a identidade Seguros Unimed
(navy `#13284b` + green `#00995d`). A "dose" de divergência é decisão explícita do usuário
no início da fase.

## Metas / critérios de aceite

- App deixa de ser confundível com dbdiagram à primeira vista, mantendo navy + green.
- Nenhuma perda de funcionalidade ou legibilidade; mudança reversível por token.
- Antes/depois capturados (verify headless com Chrome do sistema — ver memória
  `headless-verify-system-chrome`).
- 150 testes verdes.

## Estado atual do sistema visual (mapeado)

- **Tokens:** centralizados em `:root` (`styles.css:1-16`): navy, green, `--canvas-bg`,
  `--bg`, `--panel`, `--border`, `--text`, `--muted`, `--accent`, `--pk`.
- **Espalhados:** ~30-40 hex fora dos tokens (grays `#f3f6fa`/`#e2e8f0`, bordas `#c4ccd6`,
  roxo de lineage `#7c3aed`, amarelo de warning) — bloqueiam um re-skin barato.
- **Tipografia:** só `system-ui` (nenhuma fonte de marca carregada em `index.html`).
- **Sem assets de marca:** sem logo, sem favicon; título só texto.

## Plano em fases (menu de eixos — independentes, atrás de tokens)

### F0 — Tokenizar (pré-condição, **sem mudança visual**)
- Consolidar os ~30-40 hex espalhados em variáveis CSS novas (bordas, grays, raios, sombras,
  tipografia) em `styles.css`. Após isso, qualquer re-skin é barato e reversível.

### F1 — Identidade tipográfica (maior alavanca, baixo risco)
- Carregar uma fonte de marca + definir escala/peso. Sozinho já dá "cara própria".

### F2 — Linguagem dos nós
- Alternativas ao "card branco + header navy": faixa lateral de cor em vez de header sólido,
  densidade, raios, sombras. `TableNode.tsx` + `styles.css`.

### F3 — Relações
- Opções ao crow's foot (mantê-lo como um modo), cor/estilo das arestas. `EdgeMarkers.tsx`,
  `RelationEdge.tsx`.

### F4 — Shell / cromo
- Toolbar, docks, fundo do canvas, **logo + favicon** (hoje inexistentes em `index.html`).

## Arquivos a tocar (por fase)
| Fase | Arquivos |
|------|----------|
| F0 | `src/styles.css` |
| F1 | `src/styles.css`, `index.html`, assets de fonte |
| F2 | `src/canvas/TableNode.tsx`, `src/canvas/GroupNode.tsx`, `src/styles.css` |
| F3 | `src/canvas/EdgeMarkers.tsx`, `src/canvas/RelationEdge.tsx`, `src/styles.css` |
| F4 | `index.html`, `src/App.tsx` (toolbar/brand), `src/styles.css`, assets (logo/favicon) |

## Riscos
- **Quebrar algo que o usuário gosta** → cada eixo atrás de token, reversível, com antes/depois.
- **Escopo virar redesign total** → fases independentes; aprovar uma de cada vez.
- **Regressão visual no canvas grande** → reusar verify headless e checar laterais/zoom.

## Decisão pendente (no início da fase)
- Definir com o usuário a **dose** de divergência (sutil → ousada) e quais eixos (F1–F4)
  entram, antes de mexer em qualquer pixel além da tokenização (F0).
