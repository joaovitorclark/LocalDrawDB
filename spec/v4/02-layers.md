# Spec v4.2 — Layers (camadas) + seletor de visualização

> Exemplos genéricos: tabelas `raw.orders` (bronze), `stg.orders` (prata),
> `mart.dim_cliente` (ouro).

## Problema

Não há o conceito de **camada** (medallion) nas tabelas. O usuário quer marcar cada
tabela como **bronze / prata / ouro** (com cor padrão por camada), e um **seletor no
canto superior direito** para escolher quais camadas ver — escondendo ou esmaecendo
as demais.

## Comportamento

### Camadas e cor
- Camadas **fixas**: `bronze` (`#b08d57`), `prata` (`#9ca3af`), `ouro` (`#d4af37`).
- Permitir **criar camadas customizadas** (nome + cor) no painel.
- A camada define a **cor padrão do cabeçalho** da tabela. A cor por tabela
  (`canvas.json.colors`, já existente) **sobrescreve** a cor da camada quando definida.
- Atribuir camada a uma tabela: opção no menu de cor/da tabela (lista de camadas).

### Seletor de layers (overlay, canto superior direito)
- Lista as camadas com **checkbox** "mostrar".
- Toggle global **Esconder ⟷ Esmaecer**: define se as tabelas de camadas
  **não marcadas** ficam **ocultas** ou apenas **esmaecidas** (opacas).
- Também hospeda os controles de **linhagem** (ver spec 03): toggle "mostrar linhagem"
  e botão "modo linhagem".
- Botão "+ camada" para criar customizada.

## Critérios de aceite

- **AC1:** uma tabela marcada como `prata` exibe cabeçalho cinza-prata por padrão;
  definir cor manual sobrescreve.
- **AC2:** desmarcar `bronze` no seletor **esconde** (modo esconder) ou **esmaece**
  (modo esmaecer) todas as tabelas bronze e as arestas que as tocam.
- **AC3:** criar a camada "qualidade" (cor X) e atribuí-la a uma tabela funciona e persiste.
- **AC4:** atribuição de camada e camadas customizadas sobrevivem ao reload.

## Design

- `src/api.ts CanvasState`: `layers?: Record<tableId, layerId>`,
  `customLayers?: {id,name,color}[]`.
- Camadas built-in num módulo `src/layers.ts` (`BUILTIN_LAYERS`), merge com `customLayers`.
- `src/store/interaction.ts`: `visibleLayers: Set<layerId>` (default = todas),
  `layerDimMode: boolean` (esconder×esmaecer).
- Novo componente `src/canvas/LayersPanel.tsx` (overlay top-right).
- `src/canvas/TableNode.tsx`: cor padrão = `colorOf(id) ?? layerColor(layerOf(id)) ?? navy`;
  classe `node--hidden`/`node--dimmed-layer` conforme visibilidade.
- `src/canvas/hooks/useCanvasNodes.ts` / `Canvas.tsx`: aplicar visibilidade de camada aos
  nós (e arestas) — omitir (esconder) ou classe de opacidade (esmaecer).
- `src/canvas/actions.ts` (`CanvasActions`): `onSetLayer(tableId, layerId)`,
  `onAddLayer(...)`, e getters `layerOf`, `layerColor`.

## Casos de borda

- Tabela sem camada: usa cor manual ou navy; sempre visível.
- Esconder camada não deve afetar a fonte de verdade (DBML) — só apresentação.
- Interação com hover-highlight (spec atual) e com colapso de grupo (spec 01): visibilidade
  por camada é um filtro adicional, combinável.

## Testes

- Vitest: resolução de cor (override > camada > default); filtro de visibilidade por camada;
  serialização de `layers`/`customLayers`.
- Headless: alternar checkbox de camada (esconder e esmaecer); criar camada custom; cor
  padrão por camada aplicada; persistência no reload.
