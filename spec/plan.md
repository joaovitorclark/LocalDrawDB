# Plan (técnico) — LocalDrawDB

> **Como** construir o que está em [`spec.md`](./spec.md). Tarefas em [`tasks.md`](./tasks.md).

## Stack

- **Linguagem**: TypeScript (Node + browser). **Pacotes**: npm.
- **Servidor**: Fastify + `@fastify/static` (API `/api` e serve o frontend em prod).
- **Frontend**: Vite + React + React Flow + CodeMirror 6.
- **Bibliotecas de domínio**: `@dbml/core` (DBML↔modelo, render), `node-sql-parser`
  (parse de `.sql`), `js-yaml` (dbt `schema.yml`), `html-to-image` (PNG).
- **Testes**: Vitest. **Dev runner**: `tsx` + `concurrently`.

## Modelo canônico de dados (`server/model.ts`)

```ts
type Column = {
  name: string;
  type: string;        // tipo lakehouse nativo: string, decimal, timestamp, ...
  length?: number;     // ex.: decimal(15) -> 15
  scale?: number;      // decimal(p,s)
  pk?: boolean;
  nullable?: boolean;  // default true
  note?: string;
};
type Table = {
  name: string;
  schema?: string;     // namespace/banco
  columns: Column[];
  note?: string;
  group?: string;      // TableGroup (organização visual)
};
type Ref = {           // relacionamento
  from: { table: string; column: string };
  to:   { table: string; column: string };
  kind: '>' | '<' | '-' | '<>'; // n:1, 1:n, 1:1, n:n (notação DBML)
};
type Model = { tables: Table[]; refs: Ref[] };
```

`data/project.dbml` é a **fonte de verdade**; `data/canvas.json` guarda só layout
(posições por tabela, zoom). O modelo canônico é o intermediário entre DBML, SQL
de import e os geradores de DDL.

## Contratos da API (`/api`)

| Método | Rota | Entrada | Saída |
|--------|------|---------|-------|
| GET | `/api/project` | — | `{ dbml: string, canvas: object }` |
| PUT | `/api/project` | `{ dbml, canvas }` | `{ ok: true }` (grava em `data/`) |
| POST | `/api/import` | — | `{ dbml }` (varre `data/input/*.sql`, mescla) |
| POST | `/api/export/ddl` | `{ dbml }` | `{ files: string[] }` (Spark em `data/output/`) |
| POST | `/api/export/dbt` | `{ dbml }` | `{ files: string[] }` (`data/output/dbt/`) |
| POST | `/api/export/erwin` | `{ dbml }` | `{ files: string[] }` (`data/output/erwin/`) |
| POST | `/api/export/png` | `{ pngBase64 }` | `{ file }` (`data/output/diagram.png`) |

PNG é renderizado no frontend (`html-to-image`) e só persistido pelo servidor.

## Mapa de tipos (lakehouse → alvo)

| Lakehouse (DSL) | Spark DDL | erwin/ANSI |
|-----------------|-----------|------------|
| `string` | `STRING` | `VARCHAR(n)` (n = length ou 255) |
| `decimal(p[,s])` | `DECIMAL(p[,s])` | `DECIMAL(p[,s])` |
| `smallint` | `SMALLINT` | `SMALLINT` |
| `tinyint` | `TINYINT` | `SMALLINT` |
| `integer`/`int` | `INT` | `INTEGER` |
| `bigint` | `BIGINT` | `BIGINT` |
| `timestamp` | `TIMESTAMP` | `TIMESTAMP` |
| `date` | `DATE` | `DATE` |
| `boolean` | `BOOLEAN` | `BOOLEAN` |
| `double` | `DOUBLE` | `DOUBLE PRECISION` |
| `float` | `FLOAT` | `REAL` |

Tipos desconhecidos passam **inalterados** (DBML aceita tipos arbitrários).

## Colunas de metadados padrão (snippet)

`transact_id string`, `ingestion_timestamp timestamp`, `capture_timestamp timestamp`,
`business_hash string`, `content_hash string`, `operation_type string`.
Disponível como botão na UI para anexar a qualquer tabela.

## Decisões de design

- **DBML como fonte de verdade** mantém o projeto legível e versionável; o canvas é
  uma projeção + um arquivo de layout separado.
- **Geração de DDL por template próprio** (não transpiler) porque controlamos o
  modelo e queremos tipos lakehouse nativos no Spark sem perda.
- **Parse de import** usa `node-sql-parser` (dialeto `hive` ≈ Spark). Risco de
  fidelidade documentado; fallback futuro = importador sqlglot opcional.
