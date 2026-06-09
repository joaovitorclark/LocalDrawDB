# Exemplos de import SQL (versionados)

Estes arquivos ficam no repositório em `examples/input/`. O app importa de **`data/input/`** (pasta local, no `.gitignore`).

```bash
mkdir -p data/input
cp examples/input/demo_lakehouse.sql data/input/
```

Depois use **Importar (input/)** na toolbar.

## Formato dos `.sql` em `data/input/`

Coloque seus scripts exportados do banco (Oracle, Spark/Delta, ANSI). O import mescla tudo no DBML do projeto.

## Metadados (comentários `-- @…`)

Funcionam em **qualquer** dialeto, acima do `CREATE TABLE`:

| Comentário | Efeito no DBML |
|------------|----------------|
| `-- @layer: bronze` | Entrada no `LayerGroup bronze` |
| `-- @group: ingestao` | Entrada no `TableGroup ingestao` |
| `-- @note: texto` | `Note:` no bloco **Records** (não no `Table`) |
| `-- @fk: col -> schema.tabela.col` | `Ref: tabela.col > schema.tabela.col` |
| `-- @origen: schema.origem` | `Lineage { destino < origem }` (L1 tabela→tabela) |
| `-- @map <- schema.tabela.col` (inline na coluna) | `LineageFields { dest.col < orig.col }` (L2) |

Exemplo com linhagem:

```sql
-- @layer: prata
-- @origen: raw.customers
CREATE TABLE silver.dim_customer (
  customer_key BIGINT,
  natural_id BIGINT, -- @map <- raw.customers.id
  name STRING,       -- @map <- raw.customers.name
  PRIMARY KEY (customer_key)
) USING DELTA;
```

Exemplo com FK e amostra:

```sql
-- @layer: bronze
-- @group: ingestao
-- @note: Pedidos brutos do ERP
-- @fk: customer_id -> raw.customers.id
CREATE TABLE raw.orders (
  id BIGINT,
  customer_id BIGINT,
  PRIMARY KEY (id)
) USING DELTA;

INSERT INTO raw.orders (id, customer_id) VALUES (1, 100);
```

- **`@fk`** = integridade referencial (FK lógica)
- **`@origen`** = derivação ETL tabela→tabela
- **`@map`** = derivação ETL coluna→coluna (alias `@mapeamento`)

## Relacionamentos (FK)

Ordem de leitura:

1. `FOREIGN KEY (col) REFERENCES tabela (col)` no `CREATE TABLE` (Oracle/ANSI)
2. `REFERENCES tabela(col)` inline na coluna (Oracle)
3. `-- @fk: …` nos comentários

## PK composta

```sql
PRIMARY KEY (period, region)
```

Gera no DBML:

```dbml
indexes {
  (period, region) [pk]
}
```

## Dialetos suportados

| Dialeto | Sinais | Exemplo |
|---------|--------|---------|
| **Spark/Delta** | `STRING`, `USING DELTA` | `demo_lakehouse.sql` |
| **Oracle** | `VARCHAR2`, `NUMBER(`, `CONSTRAINT`, `TABLESPACE` | DDL do Data Dictionary |
| **ANSI** | `VARCHAR`, `INTEGER`, `PRIMARY KEY` | DDL genérico |

A detecção é heurística; use `-- @fk` quando o parser não extrair a constraint.

## Oracle (reverse-engineer)

Exporte `CREATE TABLE` + opcionalmente `INSERT` para amostra. Recomendado prefixar com `@layer` / `@group` / `@note` se o DDL não trouxer `COMMENT ON`.

`COMMENT ON TABLE` / `COMMENT ON COLUMN` — importados como notes (tabela → Records; coluna → `[note]` no DBML).

## Merge no re-import

- **Tabelas:** substituídas por nome qualificado (`schema.tabela`).
- **Refs:** união (não remove refs que existem só no DBML).
- **Linhagem L1/L2:** união (mantém entradas do editor + input; dedupe por par).
- Refs manuais no editor são preservadas se não conflitarem.

## Arquivo de exemplo

Veja [demo_lakehouse.sql](demo_lakehouse.sql):

- **Lakehouse** (Spark/Delta): bronze → prata → ouro, `@layer` / `@group` / `@note` / `@fk` / `@origen` / `@map`, `INSERT`, PK composta em `gold.report_revenue`, `FOREIGN KEY` em `silver.fact_orders`
- **Oracle** (final do arquivo): `staging.cliente` + `staging.pedido` com `COMMENT ON` e `CONSTRAINT … FOREIGN KEY`
