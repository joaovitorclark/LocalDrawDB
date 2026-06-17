# dbt integration — progresso / handoff

> Estado de implementação da `spec/dbt-integration-spec.md`. Branch
> **`feat/dbt-integration`**, empilhada sobre `feat/multi-project` (PR #14). Quando a #14
> mergear na `main`, rebasear esta na `main`.

## Status

| Fase | Estado | Commit |
|------|--------|--------|
| **F0 — Modelo + round-trip DBML** | ✅ feito | `04d4f33` |
| **F1 — Presets de camadas** | ✅ feito | `997ae7f` |
| **F2 — Export dbt fiel** | ✅ feito | `360ef9e` |
| **F3 — Import dbt (3 formatos)** | ✅ feito | (este commit) |
| **F4 — UI (tests/materialization/source)** | ⬜ a fazer | — |
| **F5 — dbt executável** | ⏸ futuro (fora de escopo agora) | — |

> Branch rebaseada na `main` após merge do PR #14 (multi-projeto).

Suíte: **294 testes verdes**, typecheck limpo. Restrições inegociáveis: round-trip preserva
semântica, DBML/SQL legado intacto, fixtures dbt **genéricas** (sem dados proprietários).

## O que F0 entregou (fundação — já no modelo)
`server/model.ts`:
- `Table.resourceType?: 'model'|'source'|'seed'|'snapshot'`, `materialization?`, `tags?: string[]`,
  `dbtMeta?: Record<string,unknown>` (passthrough).
- `Column.unique?` (nativo DBML `[unique]`), `Column.tests?: ColumnTest[]`.
- `ColumnTest = {kind:'unique'} | {kind:'not_null'} | {kind:'accepted_values', values} | {kind:'relationships', to, field}`.

**Encoding DBML (decidido):**
- `unique` → `[unique]` nativo; `not_null` → derivado de `nullable===false` (PK não duplica);
  `relationships` → derivado de `Ref`; `accepted_values` + config de tabela → bloco custom `Dbt { }`.
- Bloco `Dbt { table <id> { resource_type:, materialization:, tags:[...], meta {…}, columns { <col> { accepted_values:[...] } } } }`.
  Emitido **só** quando há metadados (compat retroativa). Stripado antes do `@dbml/core`
  (padrão de `src/dsl/dbmlClean.ts`); round-trip lossless coberto por
  `server/__tests__/dbtRoundtrip.test.ts`.

## O que F1 entregou
`src/layers.ts`: `LAYER_PRESETS` (`medallion-pt` [default, = bronze/prata/ouro de hoje],
`medallion-en` bronze/silver/gold, `raw-edw-mart`, `inbound-staging-solutions`, `sor-sot-spec`),
`KNOWN_LAYERS` (catálogo flat), `materializationForLayer(id)` / `resourceTypeForLayer(id)`.
`BUILTIN_LAYERS` inalterado (derivado do preset pt). `layersFromGroups` ganha auto-cor para
ids de preset conhecidos. **Sem mudança no que o painel exibe por padrão.**

---

## A FAZER

### ~~F2 — Export dbt fiel~~ ✅ FEITO (`server/dbtExport.ts`)
Reescrito de stub para export fiel. Cobertura em `server/__tests__/dbtExport.test.ts` (13 testes).
- `dbt_project.yml` real (paths, profile placeholder, default `+materialized: view`).
- `models/<schema>/sources.yml` para tabelas source (`resourceType:'source'` **ou** camada cujo
  `resourceTypeForLayer` é `source`, ex.: bronze/raw). Sources **não** geram `.sql` nem entram
  como model no `schema.yml`.
- `schema.yml` completo: descrições (`Table.note`/`Column.note`), `config` (materialized+tags),
  **tests por coluna** via helper `columnTests` (unique de pk-simples/`unique`; not_null de
  pk/`nullable===false`; accepted_values de `Column.tests`; **FK→`relationships`** de `model.refs`,
  com `to: ref('<dest>')`). Usa chave `data_tests` (dbt moderno).
- Stubs `.sql` com `{{ config() }}` + CTEs `ref()`/`source()` por upstream (lineage L1 primeiro,
  refs como fallback). Sem prometer `dbt run` verde.
- Materialization: explícita > `materializationForLayer(table.layer)` > `view`.
- **Decisões para F3 honrar no round-trip:** chave `data_tests`; source name = schema; PK composta
  → `not_null` por coluna mas **sem** `unique` por coluna (unicidade é da combinação).
- **Reuso F4:** `columnTests(table, col, refs)` é exportado.

### ~~F3 — Import dbt~~ ✅ FEITO (`server/dbtImport.ts`, `server/routes.ts`, `server/files.ts`)
Três formatos via `dbtFilesToModel(files)` (dispatcher; prefere manifest):
1. **Projeto dbt (pasta):** `dbtProjectToModel` — `models/**/schema.yml` (models+sources) +
   `models/**/*.sql` (regex extrai `ref()`/`source()`/`config` → lineage L1 + materialization/tags).
   Schema = diretório-pai do arquivo. `dbt_project.yml` é ignorado (models é objeto, não array).
2. **dbt-docs:** `manifestToModel` — `nodes`/`sources`/tests (`test_metadata`) → tipos reais,
   materialization/tags, tests resolvidos e lineage de `depends_on`. Parse defensivo.
3. **schema.yml avulso:** `schemaYmlToModel` — base reusada pelos outros dois.
- Inversão da codificação F2: `unique`+`not_null` (primeira coluna) → PK; seguintes → `unique`+not
  null; `accepted_values` → `Column.tests`; `relationships` → `Ref`; source → `resourceType:'source'`.
- **Fiação:** `readImportInputsForSlug` (novo, recursivo, lê `.sql/.yml/.yaml/.json`); `runImport`
  separa artefatos dbt do SQL DDL e mescla via `mergeModel`. Rotas `/api/import` e
  `/api/projects/:id/import` usam o leitor novo.
- **Fixtures genéricas:** `examples/dbt/` (projeto pasta + `manifest.json`). Nada proprietário.
- Testes: `server/__tests__/dbtImport.test.ts` (17, inclui round-trip F2→F3 e os fixtures) +
  `server/__tests__/dbtImportRoute.test.ts` (integração da rota).

### F4 — UI (`src/canvas/ColumnPanel.tsx`, `TableInfoPopover.tsx`, `LayersPanel.tsx`)
- ColumnPanel: ver/editar tests por coluna (unique/not_null já via pk/nullable; accepted_values;
  relationships via Ref existente).
- TableInfoPopover: `resourceType`/`materialization`/`tags` (badges/edição).
- LayersPanel: ação "inserir preset" de nomenclatura (usa `LAYER_PRESETS`).
- Integrar lineage `ref()/source()` ao que já existe (`lineage`, `lineageFields`, painéis).
- Verificar no navegador (Playwright + Chrome do sistema, ver memória `headless-verify-system-chrome`):
  importar um projeto dbt de exemplo, ver tabelas/tests/lineage; exportar e reimportar.

## Workflow usado (continuar igual)
Subagent-driven: 1 implementador (sonnet) por fase com TDD, coordenador revisa o diff,
suíte verde + typecheck a cada commit. Verificação no navegador para mudanças de UI usando
servidor de produção com `LOCALDRAWDB_DATA_DIR` **isolado** (nunca o `data/` real).
Não commitar `.claude/`.
