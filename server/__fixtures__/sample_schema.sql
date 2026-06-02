-- Fixture de exemplo (schema genérico) usada nos testes.
CREATE TABLE IF NOT EXISTS loja.canal_venda (
  cod_canal TINYINT,
  nom_canal STRING,
  transact_id STRING,
  ingestion_timestamp TIMESTAMP,
  capture_timestamp TIMESTAMP,
  business_hash STRING,
  content_hash STRING,
  operation_type STRING
) USING DELTA;

CREATE TABLE loja.origem_pedido (
  cod_origem TINYINT NOT NULL,
  nom_origem STRING,
  valor DECIMAL(18,2),
  PRIMARY KEY (cod_origem)
);
