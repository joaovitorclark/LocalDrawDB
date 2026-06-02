# Spec v4.3 — Linhagem tabela→tabela (aresta distinta de PK/FK)

> Exemplos genéricos: `stg.orders` derivada de `raw.orders`; `mart.fct_vendas`
> derivada de `stg.orders` + `stg.itens`.

## Problema

Além de ligar **campos** (PK/FK, que vira `Ref:` no DBML), o usuário quer ligar
**tabelas** para indicar que uma foi **feita a partir da outra** (ex.: uma prata vira
ouro). Essa ligação é **semanticamente diferente** de PK/FK e deve ser uma **linha de
tipo distinto**, com visibilidade alternável no seletor de layers.

## Comportamento

### Criar (modo linhagem)
- Botão **"Modo linhagem"** no `LayersPanel`. Ativo, arrastar do **corpo/cabeçalho** de
  uma tabela até outra cria uma **aresta de linhagem** (não de coluna).
- Aresta de linhagem: **tracejada/colorida** (distinta dos `Ref:` sólidos), sem
  pé-de-galinha, rótulo "derivado de" (origem → destino).
- Persistida em `canvas.json.lineage: {source, target}[]` (ids de tabela). **Nunca** vira
  `Ref:` no DBML.

### Ver / remover
- Toggle **"Mostrar linhagem"** no `LayersPanel` liga/desliga a exibição das arestas.
- Selecionar uma aresta de linhagem + **Delete** (ou botão **✕**) remove de
  `canvas.json.lineage` — reaproveitando o padrão de delete das arestas atuais.

### Importar (opcional)
- Importar de um `lineage.json` no formato gerado (`"silver.x": ["bronze.y", ...]`),
  convertendo cada par em `{source: "bronze.y", target: "silver.x"}`.

## Critérios de aceite

- **AC1:** com o modo linhagem ativo, arrastar `mart.fct_vendas` ← `stg.orders` cria a
  linha de linhagem (tracejada), distinta das `Ref:` de FK.
- **AC2:** o toggle some/mostra todas as arestas de linhagem.
- **AC3:** a linhagem **não** aparece como `Ref:` no editor (DBML intacto) e persiste em
  `canvas.json.lineage`.
- **AC4:** selecionar uma linhagem e apertar Delete a remove.

## Design

- `src/api.ts CanvasState`: `lineage?: { source: string; target: string }[]`.
- `src/store/interaction.ts`: `lineageVisible: boolean`, `lineageMode: boolean`.
- Novo edge type `src/canvas/LineageEdge.tsx` (estilo tracejado/cor própria, sem
  marcadores crow's foot) — registrado em `edgeTypes` junto do `relation`.
- `src/canvas/Canvas.tsx`:
  - quando `lineageMode`, `onConnect` (ou drag table→table) cria item em `canvas.json.lineage`
    em vez de `Ref:`; quando não, mantém o comportamento de PK/FK atual.
  - montar arestas de linhagem (type `lineage`) a partir de `canvas.json.lineage`, com
    visibilidade por `lineageVisible`.
  - delete de aresta `lineage` → remove do `canvas.json.lineage` (não toca no DBML).
- `LayersPanel` (spec 02) hospeda os toggles "Mostrar linhagem" e "Modo linhagem".
- Helper `src/dsl/lineage.ts`: normalizar/serializar; importar de `lineage.json`.

## Casos de borda

- Evitar duplicata e self-loop (mesma origem→destino).
- Linhagem entre tabelas em camadas escondidas: segue a visibilidade das tabelas (some com elas).
- Modo linhagem ativo não deve criar PK/FK por engano (handles de coluna desabilitados ou ignorados nesse modo).

## Testes

- Vitest: `lineage.ts` (add/remove/dedupe, import de `lineage.json`).
- Headless: criar/remover linhagem no modo linhagem; toggle de visibilidade; confirmar que
  o DBML não ganhou `Ref:`; persistência no reload.
