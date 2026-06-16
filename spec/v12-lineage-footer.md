# v12 — Linhagem L2 em bloco-rodapé `@lineage`

## Motivação

No formato SQL, a linhagem de coluna (L2) era escrita como comentário **inline**
na própria coluna: `coluna TIPO, -- @map <- schema.tabela.coluna`. Isso ocupava o
único espaço natural para a **descrição da coluna**.

A v12 move a L2 para um **bloco-rodapé** logo após o `CREATE TABLE`, liberando o
comentário inline para virar a descrição da coluna (`Column.note`).

> Apenas o **formato SQL** muda. No DBML, L2 já vive em bloco separado
> (`LineageFields { }`) e a nota em `[note: '...']` — **inalterado**.

## Formato (Spark e Oracle)

```sql
CREATE TABLE silver.dim_customer (
  customer_key BIGINT, -- surrogate key (SCD2)
  natural_id BIGINT,
  name STRING
) USING DELTA;
-- @lineage silver.dim_customer
--   natural_id <- raw.customers.id
--   name <- raw.customers.name [note: 'trim+upper', ref: 'jobs/dim.sql']
```

- **Cabeçalho:** `-- @lineage <tabela_destino_qualificada>`.
- **Linhas:** `--   <coluna> <- <schema.tabela.coluna_origem> [note: '...', ref: '...']`.
  O bloco termina na primeira linha que não casa o padrão.
- **Descrição de coluna:** comentário inline `-- texto` na coluna (não-diretiva).
  - Spark: emitido inline no `CREATE`.
  - Oracle: emitido via `COMMENT ON COLUMN ... IS '...'` (sem inline).

## Import (retrocompatível)

`sqlToModel` agrega L2 de **três** fontes, com dedupe por `target<-source`:

1. **Rodapé `@lineage`** (`extractFieldLineageFooter`) — formato atual.
2. **`@map` inline** (`extractFieldLineageFromStmt`) — formato legado, ainda aceito.
3. Comentário inline não-diretiva (`extractColumnComments`) → `Column.note`.
   Tem **precedência** sobre `COMMENT ON COLUMN` para a mesma coluna.

## Export

`modelToInputSql` sempre gera o rodapé `@lineage` (nunca mais `@map` inline) via
`emitLineageFooter`, na ordem das colunas da tabela. As notas de coluna saem inline
(Spark) ou como `COMMENT ON COLUMN` (Oracle).

## Fora de escopo

- Sintaxe DBML de `LineageFields` e o editor/painel L2 (CRUD inalterado).
- Sincronização automática entre `Column.note` e nota da L2 (campos distintos).
