# dbt integration — progresso / handoff

> Estado de implementação da `spec/dbt-integration-spec.md`. Branch
> **`feat/dbt-integration`**, empilhada sobre `feat/multi-project` (PR #14). Quando a #14
> mergear na `main`, rebasear esta na `main`.

## Status

| Fase | Estado | Commit |
|------|--------|--------|
| **F0 — Modelo + round-trip DBML** | ✅ feito | `e31e103` |
| **F1 — Presets de camadas** | ✅ feito | `32c3426` |
| **F2 — Export dbt fiel** | ✅ feito | (este commit) |
| **F3 — Import dbt (3 formatos)** | ⬜ a fazer | — |
| **F4 — UI (tests/materialization/source)** | ⬜ a fazer | — |
| **F5 — dbt executável** | ⏸ futuro (fora de escopo agora) | — |

Suíte: **258 testes verdes**, typecheck limpo. Restrições inegociáveis: round-trip preserva
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

### F3 — Import dbt (novo `server/dbtImport.ts`; `server/routes.ts`; `server/files.ts`)
Aceitar **3 formatos** (decisão fechada), detecção por extensão/forma no fluxo de import
existente (generalizar `readInputSql*` para `.yml`/`.json`; reusar `mergeModel`):
1. **Projeto dbt (pasta):** `dbt_project.yml` + `models/**/schema.yml` + `models/**/*.sql`
   (extrair `ref()`/`source()` → `lineage`; descrições/tests do schema.yml → notes + tests).
2. **dbt-docs:** `manifest.json`/`catalog.json` (DAG, tipos reais, tests/descrições resolvidos
   — caminho mais robusto; preferir quando presente). Parsear defensivamente (versões variam).
3. **schema.yml avulso:** `schema.yml`/`properties.yml` soltos no input.
- Usar `js-yaml` (já é dependência). Mapear materialization/tags/meta para os campos F0;
  tests (`unique`,`not_null`,`accepted_values`,`relationships`) para `Column`/`Ref`.
- Import por projeto: usar `readInputSqlForSlug`/input do projeto ativo (Spec 1 já trouxe).
- **Fixtures genéricas** em `examples/` (ex.: `examples/dbt/` mini projeto + um `manifest.json`
  pequeno). Nada proprietário.
- Testes: `server/__tests__/dbtImport.test.ts` (cada formato → model esperado; round-trip com F2).

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
