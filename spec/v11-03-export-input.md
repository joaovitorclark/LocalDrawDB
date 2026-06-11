# v11-03 — Export input/ (reverse SQL)

## Objetivo

Export reverso para `data/input/` no formato Spark e Oracle, reimportável via **Importar (input/)**.

## A. Modelo servidor enriquecido

`server/dbmlIo.ts` lê:

- `LayerGroup` → `table.layer`
- `Records` → `table.records` + `noteInRecordsOnly`
- `indexes { (a,b) [pk] }` → `compositePks`

## B. Gerador `modelToInputSql`

`server/sqlExport.ts`:

- Metadados `-- @layer`, `@group`, `@note`, `@fk`
- `CREATE TABLE` Spark (`USING DELTA`) ou Oracle (`VARCHAR2`, `NUMBER`, `CONSTRAINT`)
- `INSERT INTO … VALUES`
- Dialeto: `spark` | `oracle` | `auto`

## C. API e UI

- `POST /api/export/input` body `{ dbml, dialect }`
- Toolbar: **Export input (Spark)** e **Export input (Oracle)**
- Teste round-trip: `demo_lakehouse.sql` → import → export → estrutura equivalente

## Critérios de aceite

- AC1: Export Spark gera arquivo reimportável em `data/input/`
- AC2: Export Oracle gera SQL com metadados equivalentes
- AC3: PK composta, FKs e INSERT preservados no round-trip básico
- AC4: `@map` inline (L2) preservado quando `LineageFields` existe no DBML — ver [`v11-04-export-input-field-map.md`](./v11-04-export-input-field-map.md)
