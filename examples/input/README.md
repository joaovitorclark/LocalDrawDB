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

Exemplo:

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
- Refs manuais no editor são preservadas se não conflitarem.

## Arquivo de exemplo

Veja [demo_lakehouse.sql](demo_lakehouse.sql):

- **Lakehouse** (Spark/Delta): bronze → prata → ouro, `@layer` / `@group` / `@note` / `@fk`, `INSERT`, PK composta em `gold.report_revenue`, `FOREIGN KEY` em `silver.fact_orders`
- **Oracle** (final do arquivo): `staging.cliente` + `staging.pedido` com `COMMENT ON` e `CONSTRAINT … FOREIGN KEY`
