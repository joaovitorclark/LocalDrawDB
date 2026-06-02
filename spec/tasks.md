# Tasks — LocalDrawDB

Ordem de execução derivada de [`spec.md`](./spec.md) + [`plan.md`](./plan.md).

## Fase 0 — Spec & estrutura ✅
- [x] `.gitignore` ignorando `data/` (antes de qualquer dado)
- [x] `git init`, estrutura de pastas (`data/input`, `data/output`, `spec/`, `server/`, `src/`)
- [x] `spec/spec.md`, `spec/plan.md`, `spec/tasks.md`

## Fase 1 — Servidor + modelo + import/export DDL
- [x] `package.json` + `tsconfig` + deps (fastify, @dbml/core, node-sql-parser, js-yaml; dev: tsx, vitest, concurrently)
- [x] `server/model.ts` — modelo canônico + helpers de tipo
- [x] `server/sqlImport.ts` — `.sql` → modelo (node-sql-parser, hive)
- [x] `server/dbmlIo.ts` — DBML ↔ modelo (@dbml/core)
- [x] `server/ddl/spark.ts` — modelo → CREATE TABLE Spark
- [x] `server/files.ts` — varrer `data/input`, escrever `data/output`, persistir projeto
- [x] `server/routes.ts` + `server/index.ts` — API + estáticos
- [x] `server/__tests__` — round-trip `.sql` → modelo → DDL (fixture de exemplo)

## Fase 2 — Frontend DSL + canvas
- [x] Vite + React + TS; `src/App.tsx` layout 2 painéis
- [x] `src/editor` — CodeMirror DBML
- [x] `src/dsl` — parse DBML (@dbml/core) → nós/arestas; erros inline
- [x] `src/canvas` — React Flow (nós=tabelas, arestas=refs), drag, autolayout, grupos
- [x] Botão "+ Tabela" e snippet de metadados padrão
- [x] `src/api.ts` — integração com `/api`

## Fase 3 — Import/export por pasta
- [x] UI "Importar de input/" → `/api/import`
- [x] UI "Exportar DDL" → `/api/export/ddl` + confirmação de caminhos

## Fase 4 — Export dbt
- [x] `server/dbtExport.ts` — models + `schema.yml` + `dbt_project.yml`

## Fase 5 — PNG e erwin
- [x] `src/exportPng.ts` — html-to-image → `/api/export/png`
- [x] `server/ddl/erwin.ts` — script DDL ANSI → `data/output/erwin/`
- [x] Verificação e2e (ver `spec.md` §4)

## Fase v4 — Canvas, camadas, linhagem, editor
- [x] TableGroup colapsável + arrastar grupo (`spec/v4/01-*`)
- [x] LayerGroup no DBML + painel de camadas (`spec/v4/02-*`)
- [x] Linhagem `Lineage {}` + modo edição + mostrar linhagem (`spec/v4/03-*`)
- [x] Scroll editor + Outline (`spec/v4/04-*`)
- [x] Popover ⓘ metadados (`spec/v4/05-*`)

## Fase v5 — Import, save, records, FK UI
- [x] Save manual + toggle Auto-save + Cmd/Ctrl+S
- [x] Records filtrados por tabela/grupo; `@note` só em Records no import
- [x] SQL import: Oracle/Spark, `@fk`, FK no DDL, PK composta, `COMMENT ON`
- [x] ColumnPanel: FK via `ref:`; export `indexes { (a,b) [pk] }`
- [x] demo_lakehouse.sql + README em `data/input/`

## Fase v6 — Usabilidade e validação (roadmap)
- [x] Busca de tabelas no painel + Outline; `fitView` no canvas
- [x] Painel Problemas (`validateModel`)
- [x] Autolayout dagre por TableGroup (`Organizar canvas`)
- [x] README e SAMPLE atualizados
