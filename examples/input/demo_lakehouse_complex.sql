-- =============================================================================
-- Exemplo avançado — examples/input/demo_lakehouse_complex.sql
-- Hierarquia de linhagem maior que demo_lakehouse.sql (multi-fonte, fan-in/fan-out).
--
-- Copie para data/input/ e importe:
--   cp examples/input/demo_lakehouse_complex.sql data/input/
--
-- Camadas:
--   bronze  — 8 fontes (ERP, CRM, catálogo, pagamentos, web, logística)
--   prata   — staging → dims → fatos → bridge (cadeias L1 de 2–3 saltos)
--   ouro    — agregados → métricas → reports (L1 até 5 níveis desde bronze)
--
-- Metadados: @layer, @group, @note, @fk, @origen (L1), @map inline (L2)
-- @origen aceita múltiplas origens separadas por vírgula.
-- NOTA: esta fixture usa o formato LEGADO de L2 (`-- @map <- ...` inline na coluna)
-- de propósito, para exercitar a retrocompatibilidade do import. O formato atual é
-- o bloco-rodapé `-- @lineage` (ver demo_lakehouse.sql).
-- =============================================================================

-- --- Bronze: ERP ----------------------------------------------------------------

-- @layer: bronze
-- @group: ingestao_erp
-- @note: Cabeçalho de pedidos do ERP (SAP export diário)
-- @fk: account_external_id -> raw.crm_accounts.account_id
CREATE TABLE IF NOT EXISTS raw.erp_orders (
  order_id BIGINT,
  account_external_id STRING,
  order_date DATE,
  currency_code STRING,
  order_status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (order_id)
) USING DELTA;

INSERT INTO raw.erp_orders (order_id, account_external_id, order_date, currency_code, order_status, created_at)
VALUES (10001, 'ACC-001', '2024-03-01', 'BRL', 'closed', '2024-03-01 09:15:00');
INSERT INTO raw.erp_orders (order_id, account_external_id, order_date, currency_code, order_status, created_at)
VALUES (10002, 'ACC-002', '2024-03-02', 'BRL', 'open', '2024-03-02 11:40:00');

-- @layer: bronze
-- @group: ingestao_erp
-- @note: Linhas de pedido (granularidade item)
-- @fk: order_id -> raw.erp_orders.order_id
-- @fk: product_sku -> raw.product_catalog.sku
CREATE TABLE IF NOT EXISTS raw.erp_order_lines (
  line_id BIGINT,
  order_id BIGINT,
  product_sku STRING,
  quantity INT,
  unit_price DECIMAL(12,2),
  discount_pct DECIMAL(5,2),
  PRIMARY KEY (line_id)
) USING DELTA;

INSERT INTO raw.erp_order_lines (line_id, order_id, product_sku, quantity, unit_price, discount_pct)
VALUES (9001, 10001, 'SKU-A100', 3, 120.00, 5.00);
INSERT INTO raw.erp_order_lines (line_id, order_id, product_sku, quantity, unit_price, discount_pct)
VALUES (9002, 10001, 'SKU-B200', 1, 450.00, 0.00);
INSERT INTO raw.erp_order_lines (line_id, order_id, product_sku, quantity, unit_price, discount_pct)
VALUES (9003, 10002, 'SKU-C300', 2, 89.90, 10.00);

-- --- Bronze: CRM ----------------------------------------------------------------

-- @layer: bronze
-- @group: ingestao_crm
-- @note: Contas comerciais (Salesforce Account object)
CREATE TABLE IF NOT EXISTS raw.crm_accounts (
  account_id STRING,
  legal_name STRING,
  industry STRING,
  tier STRING,
  region STRING,
  country_code STRING,
  PRIMARY KEY (account_id)
) USING DELTA;

INSERT INTO raw.crm_accounts (account_id, legal_name, industry, tier, region, country_code)
VALUES ('ACC-001', 'Acme Industria Ltda', 'Manufacturing', 'Enterprise', 'Sudeste', 'BR');
INSERT INTO raw.crm_accounts (account_id, legal_name, industry, tier, region, country_code)
VALUES ('ACC-002', 'Beta Comercio SA', 'Retail', 'Mid-Market', 'Sul', 'BR');

-- @layer: bronze
-- @group: ingestao_crm
-- @note: Contatos vinculados à conta
-- @fk: account_id -> raw.crm_accounts.account_id
CREATE TABLE IF NOT EXISTS raw.crm_contacts (
  contact_id STRING,
  account_id STRING,
  full_name STRING,
  email STRING,
  job_role STRING,
  PRIMARY KEY (contact_id)
) USING DELTA;

INSERT INTO raw.crm_contacts (contact_id, account_id, full_name, email, job_role)
VALUES ('CT-001', 'ACC-001', 'Maria Souza', 'maria@acme.com.br', 'Buyer');
INSERT INTO raw.crm_contacts (contact_id, account_id, full_name, email, job_role)
VALUES ('CT-002', 'ACC-002', 'Joao Lima', 'joao@beta.com.br', 'Owner');

-- --- Bronze: catálogo, pagamentos, web, logística ------------------------------

-- @layer: bronze
-- @group: ingestao_catalogo
-- @note: Master de produtos (PIM → Delta)
CREATE TABLE IF NOT EXISTS raw.product_catalog (
  sku STRING,
  product_name STRING,
  category_l1 STRING,
  category_l2 STRING,
  list_price DECIMAL(12,2),
  is_active BOOLEAN,
  PRIMARY KEY (sku)
) USING DELTA;

INSERT INTO raw.product_catalog (sku, product_name, category_l1, category_l2, list_price, is_active)
VALUES ('SKU-A100', 'Motor Industrial A100', 'Maquinas', 'Motores', 125.00, true);
INSERT INTO raw.product_catalog (sku, product_name, category_l1, category_l2, list_price, is_active)
VALUES ('SKU-B200', 'Painel Controle B200', 'Eletrica', 'Painéis', 480.00, true);
INSERT INTO raw.product_catalog (sku, product_name, category_l1, category_l2, list_price, is_active)
VALUES ('SKU-C300', 'Sensor IoT C300', 'Eletronica', 'Sensores', 95.00, true);

-- @layer: bronze
-- @group: ingestao_pagamentos
-- @note: Transações do gateway (Stripe/Adyen)
-- @fk: order_id -> raw.erp_orders.order_id
CREATE TABLE IF NOT EXISTS raw.payment_transactions (
  txn_id STRING,
  order_id BIGINT,
  amount DECIMAL(18,2),
  payment_method STRING,
  payment_status STRING,
  paid_at TIMESTAMP,
  PRIMARY KEY (txn_id)
) USING DELTA;

INSERT INTO raw.payment_transactions (txn_id, order_id, amount, payment_method, payment_status, paid_at)
VALUES ('TXN-001', 10001, 796.50, 'credit_card', 'captured', '2024-03-01 10:05:00');
INSERT INTO raw.payment_transactions (txn_id, order_id, amount, payment_method, payment_status, paid_at)
VALUES ('TXN-002', 10002, 161.82, 'pix', 'pending', '2024-03-02 12:00:00');

-- @layer: bronze
-- @group: ingestao_marketing
-- @note: Eventos de navegação (Segment → S3 → Delta)
CREATE TABLE IF NOT EXISTS raw.web_events (
  event_id STRING,
  session_id STRING,
  contact_email STRING,
  event_type STRING,
  page_url STRING,
  event_ts TIMESTAMP,
  PRIMARY KEY (event_id)
) USING DELTA;

INSERT INTO raw.web_events (event_id, session_id, contact_email, event_type, page_url, event_ts)
VALUES ('EV-001', 'SES-100', 'maria@acme.com.br', 'page_view', '/pricing', '2024-03-01 08:50:00');
INSERT INTO raw.web_events (event_id, session_id, contact_email, event_type, page_url, event_ts)
VALUES ('EV-002', 'SES-100', 'maria@acme.com.br', 'add_to_cart', '/cart', '2024-03-01 08:55:00');
INSERT INTO raw.web_events (event_id, session_id, contact_email, event_type, page_url, event_ts)
VALUES ('EV-003', 'SES-101', 'joao@beta.com.br', 'page_view', '/catalog', '2024-03-02 10:20:00');

-- @layer: bronze
-- @group: ingestao_logistica
-- @note: Manifestos de expedição (TMS)
-- @fk: order_id -> raw.erp_orders.order_id
CREATE TABLE IF NOT EXISTS raw.shipping_manifests (
  manifest_id STRING,
  order_id BIGINT,
  carrier_name STRING,
  shipped_at TIMESTAMP,
  delivery_status STRING,
  PRIMARY KEY (manifest_id)
) USING DELTA;

INSERT INTO raw.shipping_manifests (manifest_id, order_id, carrier_name, shipped_at, delivery_status)
VALUES ('MAN-001', 10001, 'Correios Express', '2024-03-02 07:30:00', 'delivered');
INSERT INTO raw.shipping_manifests (manifest_id, order_id, carrier_name, shipped_at, delivery_status)
VALUES ('MAN-002', 10002, 'LogFast', '2024-03-03 14:00:00', 'in_transit');

-- --- Prata: staging (join ERP header + lines) -----------------------------------

-- @layer: prata
-- @group: staging
-- @note: Linhas enriquecidas com cabeçalho do pedido (join ERP)
-- @origen: raw.erp_orders, raw.erp_order_lines
-- @fk: order_id -> raw.erp_orders.order_id
-- @fk: product_sku -> raw.product_catalog.sku
CREATE TABLE IF NOT EXISTS silver.stg_order_lines (
  line_id BIGINT,              -- @map <- raw.erp_order_lines.line_id
  order_id BIGINT,             -- @map <- raw.erp_order_lines.order_id
  account_external_id STRING,  -- @map <- raw.erp_orders.account_external_id
  order_date DATE,             -- @map <- raw.erp_orders.order_date
  product_sku STRING,          -- @map <- raw.erp_order_lines.product_sku
  quantity INT,                -- @map <- raw.erp_order_lines.quantity
  unit_price DECIMAL(12,2),    -- @map <- raw.erp_order_lines.unit_price
  discount_pct DECIMAL(5,2),   -- @map <- raw.erp_order_lines.discount_pct
  line_amount DECIMAL(18,2),   -- @map <- raw.erp_order_lines.quantity [note: 'qty * unit_price * (1 - discount_pct/100)']
  PRIMARY KEY (line_id)
) USING DELTA;

INSERT INTO silver.stg_order_lines (line_id, order_id, account_external_id, order_date, product_sku, quantity, unit_price, discount_pct, line_amount)
VALUES (9001, 10001, 'ACC-001', '2024-03-01', 'SKU-A100', 3, 120.00, 5.00, 342.00);
INSERT INTO silver.stg_order_lines (line_id, order_id, account_external_id, order_date, product_sku, quantity, unit_price, discount_pct, line_amount)
VALUES (9002, 10001, 'ACC-001', '2024-03-01', 'SKU-B200', 1, 450.00, 0.00, 450.00);

-- --- Prata: dimensões conformed -------------------------------------------------

-- @layer: prata
-- @group: dimensional
-- @note: Dimensão conta (SCD1)
-- @origen: raw.crm_accounts
CREATE TABLE IF NOT EXISTS silver.dim_account (
  account_key BIGINT,
  account_id STRING,      -- @map <- raw.crm_accounts.account_id
  legal_name STRING,      -- @map <- raw.crm_accounts.legal_name
  industry STRING,        -- @map <- raw.crm_accounts.industry
  tier STRING,            -- @map <- raw.crm_accounts.tier
  region STRING,          -- @map <- raw.crm_accounts.region
  country_code STRING,    -- @map <- raw.crm_accounts.country_code
  PRIMARY KEY (account_key)
) USING DELTA;

INSERT INTO silver.dim_account (account_key, account_id, legal_name, industry, tier, region, country_code)
VALUES (1, 'ACC-001', 'Acme Industria Ltda', 'Manufacturing', 'Enterprise', 'Sudeste', 'BR');
INSERT INTO silver.dim_account (account_key, account_id, legal_name, industry, tier, region, country_code)
VALUES (2, 'ACC-002', 'Beta Comercio SA', 'Retail', 'Mid-Market', 'Sul', 'BR');

-- @layer: prata
-- @group: dimensional
-- @note: Dimensão contato
-- @origen: raw.crm_contacts
-- @fk: account_key -> silver.dim_account.account_key
CREATE TABLE IF NOT EXISTS silver.dim_contact (
  contact_key BIGINT,
  contact_id STRING,      -- @map <- raw.crm_contacts.contact_id
  account_key BIGINT,
  full_name STRING,       -- @map <- raw.crm_contacts.full_name
  email STRING,           -- @map <- raw.crm_contacts.email
  job_role STRING,        -- @map <- raw.crm_contacts.job_role
  PRIMARY KEY (contact_key),
  FOREIGN KEY (account_key) REFERENCES silver.dim_account (account_key)
) USING DELTA;

INSERT INTO silver.dim_contact (contact_key, contact_id, account_key, full_name, email, job_role)
VALUES (1, 'CT-001', 1, 'Maria Souza', 'maria@acme.com.br', 'Buyer');
INSERT INTO silver.dim_contact (contact_key, contact_id, account_key, full_name, email, job_role)
VALUES (2, 'CT-002', 2, 'Joao Lima', 'joao@beta.com.br', 'Owner');

-- @layer: prata
-- @group: dimensional
-- @note: Dimensão produto
-- @origen: raw.product_catalog
CREATE TABLE IF NOT EXISTS silver.dim_product (
  product_key BIGINT,
  sku STRING,             -- @map <- raw.product_catalog.sku
  product_name STRING,    -- @map <- raw.product_catalog.product_name
  category_l1 STRING,   -- @map <- raw.product_catalog.category_l1
  category_l2 STRING,   -- @map <- raw.product_catalog.category_l2
  list_price DECIMAL(12,2), -- @map <- raw.product_catalog.list_price
  PRIMARY KEY (product_key)
) USING DELTA;

INSERT INTO silver.dim_product (product_key, sku, product_name, category_l1, category_l2, list_price)
VALUES (1, 'SKU-A100', 'Motor Industrial A100', 'Maquinas', 'Motores', 125.00);
INSERT INTO silver.dim_product (product_key, sku, product_name, category_l1, category_l2, list_price)
VALUES (2, 'SKU-B200', 'Painel Controle B200', 'Eletrica', 'Painéis', 480.00);

-- @layer: prata
-- @group: dimensional
-- @note: Dimensão calendário (gerada — sem @origen; referência para fatos)
CREATE TABLE IF NOT EXISTS silver.dim_calendar (
  date_key INT,
  calendar_date DATE,
  year_num INT,
  month_num INT,
  quarter_num INT,
  is_weekend BOOLEAN,
  PRIMARY KEY (date_key)
) USING DELTA;

INSERT INTO silver.dim_calendar (date_key, calendar_date, year_num, month_num, quarter_num, is_weekend)
VALUES (20240301, '2024-03-01', 2024, 3, 1, false);
INSERT INTO silver.dim_calendar (date_key, calendar_date, year_num, month_num, quarter_num, is_weekend)
VALUES (20240302, '2024-03-02', 2024, 3, 1, true);

-- --- Prata: fatos ---------------------------------------------------------------

-- @layer: prata
-- @group: fatos
-- @note: Fato linha de pedido (granularidade item)
-- @origen: silver.stg_order_lines
-- @fk: account_key -> silver.dim_account.account_key
-- @fk: product_key -> silver.dim_product.product_key
-- @fk: date_key -> silver.dim_calendar.date_key
CREATE TABLE IF NOT EXISTS silver.fact_order_lines (
  line_id BIGINT,           -- @map <- silver.stg_order_lines.line_id
  order_id BIGINT,            -- @map <- silver.stg_order_lines.order_id
  account_key BIGINT,
  product_key BIGINT,
  date_key INT,
  quantity INT,               -- @map <- silver.stg_order_lines.quantity
  line_amount DECIMAL(18,2),  -- @map <- silver.stg_order_lines.line_amount
  order_status STRING,        -- @map <- raw.erp_orders.order_status [note: 'propagado via stg join']
  PRIMARY KEY (line_id),
  FOREIGN KEY (account_key) REFERENCES silver.dim_account (account_key),
  FOREIGN KEY (product_key) REFERENCES silver.dim_product (product_key),
  FOREIGN KEY (date_key) REFERENCES silver.dim_calendar (date_key)
) USING DELTA;

INSERT INTO silver.fact_order_lines (line_id, order_id, account_key, product_key, date_key, quantity, line_amount, order_status)
VALUES (9001, 10001, 1, 1, 20240301, 3, 342.00, 'closed');
INSERT INTO silver.fact_order_lines (line_id, order_id, account_key, product_key, date_key, quantity, line_amount, order_status)
VALUES (9002, 10001, 1, 2, 20240301, 1, 450.00, 'closed');

-- @layer: prata
-- @group: fatos
-- @note: Fato pagamentos (1 linha por transação)
-- @origen: raw.payment_transactions
-- @fk: order_id -> silver.fact_order_lines.order_id
CREATE TABLE IF NOT EXISTS silver.fact_payments (
  txn_id STRING,              -- @map <- raw.payment_transactions.txn_id
  order_id BIGINT,            -- @map <- raw.payment_transactions.order_id
  amount DECIMAL(18,2),       -- @map <- raw.payment_transactions.amount
  payment_method STRING,      -- @map <- raw.payment_transactions.payment_method
  payment_status STRING,      -- @map <- raw.payment_transactions.payment_status
  paid_at TIMESTAMP,          -- @map <- raw.payment_transactions.paid_at
  PRIMARY KEY (txn_id)
) USING DELTA;

INSERT INTO silver.fact_payments (txn_id, order_id, amount, payment_method, payment_status, paid_at)
VALUES ('TXN-001', 10001, 796.50, 'credit_card', 'captured', '2024-03-01 10:05:00');

-- @layer: prata
-- @group: fatos
-- @note: Sessões web agregadas por session_id
-- @origen: raw.web_events
-- @fk: contact_key -> silver.dim_contact.contact_key
CREATE TABLE IF NOT EXISTS silver.fact_web_sessions (
  session_id STRING,          -- @map <- raw.web_events.session_id
  contact_key BIGINT,
  event_count INT,            -- @map <- raw.web_events.event_id [note: 'COUNT(DISTINCT event_id) por session']
  first_event_ts TIMESTAMP,   -- @map <- raw.web_events.event_ts [note: 'MIN(event_ts)']
  last_event_ts TIMESTAMP,    -- @map <- raw.web_events.event_ts [note: 'MAX(event_ts)']
  PRIMARY KEY (session_id)
) USING DELTA;

INSERT INTO silver.fact_web_sessions (session_id, contact_key, event_count, first_event_ts, last_event_ts)
VALUES ('SES-100', 1, 2, '2024-03-01 08:50:00', '2024-03-01 08:55:00');

-- @layer: prata
-- @group: enriquecimento
-- @note: Bridge pedido ↔ expedição (fan-in logística + fato)
-- @origen: raw.shipping_manifests, silver.fact_order_lines
-- @fk: order_id -> silver.fact_order_lines.order_id
CREATE TABLE IF NOT EXISTS silver.bridge_order_fulfillment (
  manifest_id STRING,         -- @map <- raw.shipping_manifests.manifest_id
  order_id BIGINT,            -- @map <- raw.shipping_manifests.order_id
  carrier_name STRING,        -- @map <- raw.shipping_manifests.carrier_name
  delivery_status STRING,     -- @map <- raw.shipping_manifests.delivery_status
  line_count INT,             -- @map <- silver.fact_order_lines.line_id [note: 'COUNT(line_id) por order_id']
  PRIMARY KEY (manifest_id)
) USING DELTA;

INSERT INTO silver.bridge_order_fulfillment (manifest_id, order_id, carrier_name, delivery_status, line_count)
VALUES ('MAN-001', 10001, 'Correios Express', 'delivered', 2);

-- --- Ouro: agregados intermediários ---------------------------------------------

-- @layer: ouro
-- @group: agregados
-- @note: Receita diária por região e indústria (fan-in fato linhas + pagamentos)
-- @origen: silver.fact_order_lines, silver.fact_payments
CREATE TABLE IF NOT EXISTS gold.fct_revenue_daily (
  revenue_date DATE,          -- @map <- silver.fact_order_lines.date_key [note: 'JOIN dim_calendar → calendar_date']
  region STRING,              -- @map <- silver.dim_account.region [note: 'via account_key']
  industry STRING,            -- @map <- silver.dim_account.industry [note: 'via account_key']
  gross_revenue DECIMAL(18,2), -- @map <- silver.fact_order_lines.line_amount [note: 'SUM(line_amount)']
  captured_payments DECIMAL(18,2), -- @map <- silver.fact_payments.amount [note: 'SUM(amount) WHERE status=captured']
  line_count INT,
  PRIMARY KEY (revenue_date, region)
) USING DELTA;

INSERT INTO gold.fct_revenue_daily (revenue_date, region, industry, gross_revenue, captured_payments, line_count)
VALUES ('2024-03-01', 'Sudeste', 'Manufacturing', 792.00, 796.50, 2);

-- @layer: ouro
-- @group: agregados
-- @note: Engajamento digital por conta (fan-in sessões + dim contato)
-- @origen: silver.fact_web_sessions, silver.dim_contact
-- @fk: account_key -> silver.dim_account.account_key
CREATE TABLE IF NOT EXISTS gold.fct_customer_engagement (
  account_key BIGINT,
  total_sessions INT,         -- @map <- silver.fact_web_sessions.session_id [note: 'COUNT(DISTINCT session_id)']
  total_events INT,           -- @map <- silver.fact_web_sessions.event_count [note: 'SUM(event_count)']
  last_session_at TIMESTAMP,  -- @map <- silver.fact_web_sessions.last_event_ts [note: 'MAX(last_event_ts)']
  PRIMARY KEY (account_key)
) USING DELTA;

INSERT INTO gold.fct_customer_engagement (account_key, total_sessions, total_events, last_session_at)
VALUES (1, 1, 2, '2024-03-01 08:55:00');

-- @layer: ouro
-- @group: agregados
-- @note: Spend acumulado por conta (rollup de receita diária)
-- @origen: gold.fct_revenue_daily, silver.dim_account
-- @fk: account_key -> silver.dim_account.account_key
CREATE TABLE IF NOT EXISTS gold.fct_customer_spend (
  account_key BIGINT,
  lifetime_gross DECIMAL(18,2), -- @map <- gold.fct_revenue_daily.gross_revenue [note: 'SUM(gross_revenue) por account via region/industry match']
  lifetime_payments DECIMAL(18,2), -- @map <- gold.fct_revenue_daily.captured_payments [note: 'SUM(captured_payments)']
  order_line_count INT,
  PRIMARY KEY (account_key)
) USING DELTA;

INSERT INTO gold.fct_customer_spend (account_key, lifetime_gross, lifetime_payments, order_line_count)
VALUES (1, 792.00, 796.50, 2);

-- --- Ouro: reports (topo da hierarquia) -----------------------------------------

-- @layer: ouro
-- @group: reports
-- @note: Visão 360° cliente — fan-in spend + engajamento + dimensão
-- @origen: gold.fct_customer_spend, gold.fct_customer_engagement, silver.dim_account
CREATE TABLE IF NOT EXISTS gold.report_customer_360 (
  account_key BIGINT,
  legal_name STRING,          -- @map <- silver.dim_account.legal_name
  tier STRING,                -- @map <- silver.dim_account.tier
  lifetime_gross DECIMAL(18,2), -- @map <- gold.fct_customer_spend.lifetime_gross
  lifetime_payments DECIMAL(18,2), -- @map <- gold.fct_customer_spend.lifetime_payments
  total_sessions INT,         -- @map <- gold.fct_customer_engagement.total_sessions
  engagement_score DECIMAL(5,2), -- @map <- gold.fct_customer_engagement.total_events [note: 'normalizado 0-100']
  PRIMARY KEY (account_key)
) USING DELTA;

INSERT INTO gold.report_customer_360 (account_key, legal_name, tier, lifetime_gross, lifetime_payments, total_sessions, engagement_score)
VALUES (1, 'Acme Industria Ltda', 'Enterprise', 792.00, 796.50, 1, 85.00);

-- @layer: ouro
-- @group: reports
-- @note: Dashboard executivo — topo da cadeia (5+ saltos desde bronze)
-- @origen: gold.fct_revenue_daily, gold.report_customer_360, silver.bridge_order_fulfillment
CREATE TABLE IF NOT EXISTS gold.report_exec_dashboard (
  report_date DATE,
  region STRING,              -- @map <- gold.fct_revenue_daily.region
  gross_revenue DECIMAL(18,2), -- @map <- gold.fct_revenue_daily.gross_revenue [note: 'SUM por report_date/region']
  captured_payments DECIMAL(18,2), -- @map <- gold.fct_revenue_daily.captured_payments
  active_accounts INT,        -- @map <- gold.report_customer_360.account_key [note: 'COUNT DISTINCT com spend > 0']
  delivered_orders INT,       -- @map <- silver.bridge_order_fulfillment.order_id [note: 'COUNT WHERE delivery_status=delivered']
  avg_engagement_score DECIMAL(5,2), -- @map <- gold.report_customer_360.engagement_score [note: 'AVG(engagement_score)']
  PRIMARY KEY (report_date, region)
) USING DELTA;

INSERT INTO gold.report_exec_dashboard (report_date, region, gross_revenue, captured_payments, active_accounts, delivered_orders, avg_engagement_score)
VALUES ('2024-03-01', 'Sudeste', 792.00, 796.50, 1, 1, 85.00);
