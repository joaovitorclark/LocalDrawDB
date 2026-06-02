# Spec v4.5 — Metadados: ícone ⓘ na tabela (sources, sample, PK/FK, comentários)

> Exemplos genéricos: `mart.dim_cliente` com `Note`, colunas com `[note: '...']` e um
> bloco `Records`.

## Problema

Não há uma forma rápida de ver os **metadados** de uma tabela direto no canvas. O usuário
quer um ícone **ⓘ** ao lado do seletor de cor; ao passar o mouse, um popover mostra:
**sources** (origens de linhagem), **exemplo de dados**, **PKs/FKs** e **comentários**.

## Comportamento

- O ícone **ⓘ** aparece no cabeçalho (ao lado do ● de cor) **somente quando a tabela tem
  metadados** (qualquer um: linhagem de origem, Records, notes, ou PK/FK).
- **Hover** no ⓘ abre um popover com 4 seções (omitir seção vazia):
  1. **Sources (linhagem):** tabelas de origem em `canvas.json.lineage` cujo `target` é esta
     tabela (ex.: "derivado de raw.orders").
  2. **Exemplo de dados:** primeiras linhas do `Records` desta tabela (de `parsed.records`).
  3. **PKs/FKs:** colunas PK; FKs = `refs` que partem desta tabela (campo → tabela.coluna) e
     que chegam (referenciada por …).
  4. **Comentários:** `note` da tabela e notes de colunas (exige extensão do parser).

## Critérios de aceite

- **AC1:** `mart.dim_cliente` com Note + coluna com `[note]` + Records + uma FK mostra o ⓘ;
  hover lista as 4 seções com o conteúdo correto.
- **AC2:** uma tabela sem nenhum metadado **não** mostra o ⓘ.
- **AC3:** sair com o mouse fecha o popover; abrir não interfere em seleção/edição.

## Design

- `src/dsl/parse.ts`: estender `TableView` com `note?: string` e `ColumnView` com
  `note?: string` (ler `t.note` e `f.note` do `@dbml/core`). `records`/`refs` já existem.
- Modelo de metadados por tabela (helper `tableMetadata(tableId, parsed, lineage)`):
  `{ sources: string[], sample: ParsedRecords | null, pks: string[], fks: {...}[], comments: {...} }`.
- `src/canvas/TableNode.tsx`: renderizar o ⓘ quando `hasMetadata`; controlar o popover
  (hover/foco). Reaproveitar `useCanvasActions`/contexto para acessar `lineage` e `records`.
- Novo `src/canvas/TableInfoPopover.tsx` com as 4 seções.
- Sources vêm de `canvas.json.lineage` (spec 03); sample de `parsed.records`; PK/FK do
  `parsed` (colunas pk + `parsed.refs`); comentários do parser estendido.

## Casos de borda

- Popover não pode ser cortado pelo nó/zoom do React Flow (renderizar acima, com `z-index`).
- Tabela com muitas linhas em Records: mostrar só as primeiras N (ex.: 5) + "… (N linhas)".
- Hover do ⓘ não deve disparar o hover-highlight de relações de forma conflitante.

## Testes

- Vitest: parser captura `note` de tabela e de coluna; `tableMetadata(...)` agrega as 4
  seções corretamente (incl. omissão quando vazio); `hasMetadata` true/false.
- Headless: ⓘ aparece só com metadados; hover abre popover com as seções; sair fecha.
