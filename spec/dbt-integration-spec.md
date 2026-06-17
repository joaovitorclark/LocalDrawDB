# Spec: Integração dbt (import YAML, export fiel, features)

> Restrição inegociável: **round-trip preserva semântica**, **zero regressão** no DBML/SQL
> atual (DBML antigo continua parseando), suíte de testes (~150) verde. Fixtures dbt
> **genéricas** em `examples/` — sem dados proprietários.

## Problema

O suporte a dbt hoje é uma via única e rasa: o export (`server/dbtExport.ts`) é um **stub**.
Gera `dbt_project.yml` + `models/{schema}/*.sql` placeholder (com `TODO`) + `schema.yml`
básico (só PK → `['unique','not_null']`). Não há:
- **Import** de dbt (nem projeto em pasta, nem artefatos dbt-docs, nem schema.yml avulso).
- `ref()` / `source()`, `sources.yml`, materializations, tags.
- Tests por coluna além de PK.

O modelo canônico (`server/model.ts`) é expressivo (tables, columns, refs, lineage L1/L2,
records, layer, group) mas **não carrega metadados dbt** (resource_type, materialization,
tags, tests, ref/source).

## Metas / critérios de aceite

- Importar um **projeto dbt de exemplo** (pasta yml+sql), um **`manifest.json`** e um
  **`schema.yml` avulso** e ver tabelas/colunas/tests/lineage no canvas.
- Exportar **dbt fiel** (opção 1): `dbt_project.yml` + `sources.yml` + `schema.yml`
  completos + stubs `.sql` com `ref()`/`source()` corretos — **reimportável** (round-trip).
- Tests por coluna (não só PK); FK → `relationships` test.
- Materialization e tags por model; sources distinguidos de models.
- **Nomes de camadas configuráveis** (presets de nomenclatura), não só bronze/prata/ouro.
- 150 testes verdes; DBML/SQL legado intacto.

> **Nível de ambição (decisão fechada):** Fase atual = **modelagem/documentação fiel**
> (opção 1). **dbt executável de verdade** (opção 2) é **fase futura** — documentada aqui
> em F5, não implementada agora.

## Enriquecer o modelo canônico (`server/model.ts`) — base de tudo

- `Table`: `resourceType?: 'model' | 'source' | 'seed' | 'snapshot'` (default `model`),
  `materialization?: 'table' | 'view' | 'incremental' | 'ephemeral'`, `tags?: string[]`,
  `dbtMeta?: Record<string, unknown>` (passthrough p/ não perder nada no round-trip).
- `Column`: `tests?: ColumnTest[]` onde
  `ColumnTest = { kind: 'unique' | 'not_null' | 'accepted_values' | 'relationships', args?: ... }`.
  Generaliza o atual PK → tests (PK passa a derivar `unique` + `not_null`).
- `Ref` / `lineage` / `lineageFields` (já existentes) viram a ponte para `relationships`
  test e para `ref()`/`source()`.
- **Round-trip DBML** (`server/dbmlIo.ts`): novos campos serializados em blocos/atributos
  DBML com **compat retroativa** — DBML sem esses campos continua parseando igual.

## Import dbt — novo `server/dbtImport.ts` (aceitar os três formatos)

1. **Projeto dbt (pasta yml+sql):** ler `dbt_project.yml` + `models/**/schema.yml` +
   `models/**/*.sql`. Extrair `ref()`/`source()` do SQL → lineage L1; descrições/tests do
   `schema.yml` → notes + `Column.tests`.
2. **Artefatos dbt-docs (`manifest.json` / `catalog.json`):** caminho mais rico e robusto —
   DAG completo, tipos reais (catalog), tests e descrições já resolvidos. Preferir quando
   presente.
3. **`schema.yml` avulso:** aceitar `schema.yml` / `properties.yml` soltos no `input/`
   (models/sources/columns/tests) sem precisar do projeto completo.

Detecção por extensão/forma no fluxo de import existente (`server/routes.ts` `/api/import`,
`readInputSql` generalizado para `.yml`/`.json`). Reusar `mergeModel` para combinar com SQL.

## Export dbt fiel (Fase atual — opção 1) — upgrade de `server/dbtExport.ts`

- `dbt_project.yml` real (paths, profile placeholder, config por camada).
- `models/**/sources.yml` para tabelas com `resourceType: source` / camada raw.
- `schema.yml` completo: descrições (`Table.note` / `Column.note`), **tests por coluna**
  (de `Column.tests`), **FK → `relationships` test** (de `Ref`).
- Materialization por model (derivável da camada; ver presets) + tags.
- Stubs `.sql` com `ref()`/`source()` **corretos** a partir de refs/lineage — sem prometer
  `dbt run` verde.

## Features extras (decisões fechadas)

- **Sources & staging:** distinguir source vs model; gerar `sources.yml`; marcar
  `resourceType`/camada no modelo e na UI.
- **Tests:** modelar/editar tests por coluna além de PK; FK → relationships; ver/editar no
  painel (estender `src/canvas/ColumnPanel.tsx`).
- **Materializations & tags** por model (derivável da camada medallion) + edição na UI.
- **Lineage via `ref()`/`source()`:** derivar L1/L2 a partir de `ref()`/`source()` e
  vice-versa, integrando ao que já existe (`lineage`, `lineageFields`, painéis de linhagem).
- **Nomes de camadas voláteis/configuráveis:** generalizar `src/layers.ts` — hoje
  `BUILTIN_LAYERS` é fixo bronze/prata/ouro (`layers.ts:5-9`) e sempre prefixado. Introduzir
  **presets de nomenclatura** reconhecíveis, ex.:
  - `bronze / silver / gold`
  - `raw / edw / mart`
  - `inbound / staging / solutions`
  - `sor / sot / spec`
  Cada preset mapeia camada → cor + materialization/resource_type sugeridos. Camadas
  customizadas via `LayerGroup` continuam funcionando (`layersFromGroups`).

## Plano em fases
| Fase | Foco | Arquivos |
|------|------|----------|
| F0 | Modelo + round-trip DBML | `server/model.ts`, `server/dbmlIo.ts`, `src/dsl/parse.ts`, `src/dsl/dbmlClean.ts`, testes |
| F1 | Camadas configuráveis / presets | `src/layers.ts`, `src/api.ts` (tipo Layer), UI de camadas |
| F2 | Export dbt fiel | `server/dbtExport.ts`, `server/exportDispatch.ts` |
| F3 | Import dbt (3 formatos) | novo `server/dbtImport.ts`, `server/routes.ts`, `server/files.ts` |
| F4 | UI (tests/materialization/source) | `src/canvas/ColumnPanel.tsx`, `src/canvas/TableInfoPopover.tsx`, `src/canvas/LayersPanel.tsx` |
| F5 | **(futura)** dbt executável (opção 2) | `server/dbtExport.ts` — SQL de transformação por model via lineage L2 |

## Riscos
- **Round-trip perdendo dados** → `dbtMeta` passthrough + testes de round-trip por formato.
- **manifest.json gigante / versões de schema dbt** → parsear defensivamente, tolerar campos
  ausentes; fixar versão(ões) de manifest suportadas na spec de implementação.
- **DBML legado quebrando** → novos campos opcionais; teste com fixtures antigas.
- **Ambiguidade SQL ref()/source()** → começar pelo manifest (resolvido) antes do parse de
  SQL cru.
- **Explosão de escopo do dbt executável** → contido em F5, fora do escopo atual.
