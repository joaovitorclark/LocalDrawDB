-- =============================================================================
-- Exemplo canônico — examples/input/demo_lakehouse.sql
-- Copie para data/input/ e use "Importar (input/)" na toolbar:
--   cp examples/input/demo_lakehouse.sql data/input/
--
-- Metadados (acima de cada CREATE):
--   @layer   → LayerGroup no DBML
--   @group   → TableGroup no DBML
--   @note    → Note no bloco Records (não no Table)
--   @fk      → Ref no DBML (integridade referencial)
--   @origen  → Linhagem L1 tabela→tabela (Lineage { } no DBML)
--
-- Linhagem L2 (campo→campo) — bloco-rodapé APÓS o CREATE (vira LineageFields { }):
--   -- @lineage schema.tabela_destino
--   --   coluna <- schema.tabela_origem.coluna [note: '...', ref: '...']
--
-- Descrição de coluna: comentário inline `-- texto` na própria coluna
--   (vira [note] no DBML / COMMENT ON COLUMN no Oracle). Ex.:
--   customer_key BIGINT, -- surrogate key (SCD2)
--
-- Compat: o formato antigo `coluna TIPO, -- @map <- ...` inline ainda é importado.
--
-- Trecho Oracle (staging.*) no final: @layer/@fk/@note + COMMENT ON.
--
-- Também suportado no DDL:
--   PRIMARY KEY (col) ou PRIMARY KEY (a, b)  → PK / PK composta (indexes)
--   FOREIGN KEY (coluna) REFERENCES schema.outra_tabela(coluna) → Ref (Oracle/ANSI)
--   INSERT INTO ... VALUES                   → bloco Records
-- =============================================================================

-- --- Bronze: ingestão (Spark/Delta) ------------------------------------------

-- @layer: bronze
-- @group: ingestao
-- @note: Pedidos brutos do ERP (CDC diário). Note aparece em "Dados (amostra)" após import.
-- @fk: customer_id -> raw.customers.id
-- @fk: product_id -> raw.products.id
CREATE TABLE IF NOT EXISTS raw.orders (
  id BIGINT,
  customer_id BIGINT,
  product_id BIGINT,
  quantity INT,
  total DECIMAL(18,2),
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
) USING DELTA;

INSERT INTO raw.orders (id, customer_id, product_id, quantity, total, status, created_at)
VALUES (1, 100, 501, 2, 199.90, 'delivered', '2024-01-15 10:30:00');
INSERT INTO raw.orders (id, customer_id, product_id, quantity, total, status, created_at)
VALUES (2, 101, 502, 1, 49.90, 'shipped', '2024-01-16 14:20:00');
INSERT INTO raw.orders (id, customer_id, product_id, quantity, total, status, created_at)
VALUES (3, 100, 503, 5, 750.00, 'pending', '2024-01-17 09:00:00');

-- @layer: bronze
-- @group: ingestao
-- @note: Clientes ingeridos do CRM (Fivetran)
CREATE TABLE IF NOT EXISTS raw.customers (
  id BIGINT,
  name STRING,
  email STRING,
  segment STRING,
  region STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
) USING DELTA;

INSERT INTO raw.customers (id, name, email, segment, region, created_at)
VALUES (100, 'Alice Silva', 'alice@empresa.com', 'Enterprise', 'Sudeste', '2023-06-01 00:00:00');
INSERT INTO raw.customers (id, name, email, segment, region, created_at)
VALUES (101, 'Bob Santos', 'bob@loja.com.br', 'B2C', 'Sul', '2023-07-15 00:00:00');
INSERT INTO raw.customers (id, name, email, segment, region, created_at)
VALUES (102, 'Carlos Oliveira, Jr.', 'carlos@b2b.io', 'B2B', 'Nordeste', '2023-08-20 00:00:00');

-- @layer: bronze
-- @group: ingestao
-- @note: Catálogo de produtos (snapshot diário)
CREATE TABLE IF NOT EXISTS raw.products (
  id BIGINT,
  sku STRING,
  name STRING,
  category STRING,
  price DECIMAL(10,2),
  is_active BOOLEAN,
  PRIMARY KEY (id)
) USING DELTA;

INSERT INTO raw.products (id, sku, name, category, price, is_active)
VALUES (501, 'SKU-001', 'Widget Pro', 'Hardware', 99.95, true);
INSERT INTO raw.products (id, sku, name, category, price, is_active)
VALUES (502, 'SKU-002', 'Gadget Mini', 'Acessorios', 49.90, true);
INSERT INTO raw.products (id, sku, name, category, price, is_active)
VALUES (503, 'SKU-003', 'Modulo Enterprise', 'Software', 150.00, true);

-- --- Prata: dimensional + fato -------------------------------------------------

-- @layer: prata
-- @group: dimensional
-- @note: SCD tipo 2 de clientes (surrogate key)
-- @origen: raw.customers
-- @fk: natural_id -> raw.customers.id
CREATE TABLE IF NOT EXISTS silver.dim_customer (
  customer_key BIGINT, -- surrogate key (SCD2)
  natural_id BIGINT,
  name STRING,
  email STRING,
  segment STRING,
  region STRING,
  is_current BOOLEAN, -- flag da versão vigente
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  PRIMARY KEY (customer_key)
) USING DELTA;
-- @lineage silver.dim_customer
--   natural_id <- raw.customers.id
--   name <- raw.customers.name
--   email <- raw.customers.email
--   segment <- raw.customers.segment
--   region <- raw.customers.region

INSERT INTO silver.dim_customer (customer_key, natural_id, name, email, segment, region, is_current, valid_from, valid_to)
VALUES (1, 100, 'Alice Silva', 'alice@empresa.com', 'Enterprise', 'Sudeste', true, '2023-06-01', null);
INSERT INTO silver.dim_customer (customer_key, natural_id, name, email, segment, region, is_current, valid_from, valid_to)
VALUES (2, 101, 'Bob Santos', 'bob@loja.com.br', 'B2C', 'Sul', true, '2023-07-15', null);

-- @layer: prata
-- @group: dimensional
-- @note: Dimensão de produto (snapshot)
-- @origen: raw.products
-- @fk: sku -> raw.products.sku
CREATE TABLE IF NOT EXISTS silver.dim_product (
  product_key BIGINT,
  sku STRING, -- código de negócio do produto
  name STRING,
  category STRING,
  price DECIMAL(10,2),
  PRIMARY KEY (product_key)
) USING DELTA;
-- @lineage silver.dim_product
--   sku <- raw.products.sku
--   name <- raw.products.name
--   category <- raw.products.category
--   price <- raw.products.price

INSERT INTO silver.dim_product (product_key, sku, name, category, price)
VALUES (1, 'SKU-001', 'Widget Pro', 'Hardware', 99.95);
INSERT INTO silver.dim_product (product_key, sku, name, category, price)
VALUES (2, 'SKU-002', 'Gadget Mini', 'Acessorios', 49.90);

-- @layer: prata
-- @group: fatos
-- @note: Fato de pedidos — FK explícitas no DDL (além de @fk acima nas dims)
-- @origen: raw.orders
CREATE TABLE IF NOT EXISTS silver.fact_orders (
  order_id BIGINT,
  customer_key BIGINT,
  product_key BIGINT,
  quantity INT,
  total DECIMAL(18,2), -- valor bruto do pedido
  order_date DATE,
  status STRING,
  PRIMARY KEY (order_id),
  FOREIGN KEY (customer_key) REFERENCES silver.dim_customer (customer_key),
  FOREIGN KEY (product_key) REFERENCES silver.dim_product (product_key)
) USING DELTA;
-- @lineage silver.fact_orders
--   order_id <- raw.orders.id
--   quantity <- raw.orders.quantity
--   total <- raw.orders.total
--   status <- raw.orders.status

INSERT INTO silver.fact_orders (order_id, customer_key, product_key, quantity, total, order_date, status)
VALUES (1, 1, 1, 2, 199.90, '2024-01-15', 'delivered');
INSERT INTO silver.fact_orders (order_id, customer_key, product_key, quantity, total, order_date, status)
VALUES (2, 2, 2, 1, 49.90, '2024-01-16', 'shipped');

-- --- Ouro: agregado com PK composta ------------------------------------------

-- @layer: ouro
-- @group: reports
-- @note: Receita mensal por região e segmento (chave composta period + region)
-- @origen: silver.fact_orders
CREATE TABLE IF NOT EXISTS gold.report_revenue (
  period DATE,
  region STRING,
  segment STRING,
  total_revenue DECIMAL(18,2),
  order_count INT,
  avg_ticket DECIMAL(10,2),
  PRIMARY KEY (period, region)
) USING DELTA;
-- @lineage gold.report_revenue
--   total_revenue <- silver.fact_orders.total [note: 'SUM(total) por periodo/regiao']

INSERT INTO gold.report_revenue (period, region, segment, total_revenue, order_count, avg_ticket)
VALUES ('2024-01-01', 'Sudeste', 'Enterprise', 949.90, 2, 474.95);
INSERT INTO gold.report_revenue (period, region, segment, total_revenue, order_count, avg_ticket)
VALUES ('2024-01-01', 'Sul', 'B2C', 49.90, 1, 49.90);

-- --- Exemplo Oracle (mesmo arquivo, outro dialeto) ------------------------------
-- Trecho típico de export Data Dictionary / SQL Developer.
-- Metadados @layer/@group/@note/@fk e COMMENT ON também são suportados.

-- @layer: bronze
-- @group: ingestao
-- @note: Clientes no staging Oracle (antes da carga no lakehouse)
CREATE TABLE staging.cliente (
  cod_cliente NUMBER(10) NOT NULL,
  nom_cliente VARCHAR2(200),
  dsc_email VARCHAR2(120),
  CONSTRAINT pk_stg_cliente PRIMARY KEY (cod_cliente)
);

COMMENT ON TABLE staging.cliente IS 'Clientes no staging Oracle';
COMMENT ON COLUMN staging.cliente.nom_cliente IS 'Nome completo';

INSERT INTO staging.cliente (cod_cliente, nom_cliente, dsc_email)
VALUES (100, 'Alice Silva', 'alice@empresa.com');
INSERT INTO staging.cliente (cod_cliente, nom_cliente, dsc_email)
VALUES (101, 'Bob Santos', 'bob@loja.com.br');

-- @layer: bronze
-- @group: ingestao
-- @note: Pedidos com FK explícita (CONSTRAINT … FOREIGN KEY)
CREATE TABLE staging.pedido (
  num_pedido VARCHAR2(40) NOT NULL,
  cod_cliente NUMBER(10),
  val_total NUMBER(12,2),
  dt_pedido TIMESTAMP,
  CONSTRAINT pk_stg_pedido PRIMARY KEY (num_pedido),
  CONSTRAINT fk_stg_pedido_cliente FOREIGN KEY (cod_cliente)
    REFERENCES staging.cliente (cod_cliente)
);

INSERT INTO staging.pedido (num_pedido, cod_cliente, val_total, dt_pedido)
VALUES ('PED-2024-001', 100, 199.90, TIMESTAMP '2024-01-10 08:00:00');
INSERT INTO staging.pedido (num_pedido, cod_cliente, val_total, dt_pedido)
VALUES ('PED-2024-002', 101, 49.90, TIMESTAMP '2024-01-11 14:30:00');
