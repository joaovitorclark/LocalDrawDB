import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelToDbml } from '../dbmlIo.ts';
import { detectSqlDialect, sqlToModel } from '../sqlImport.ts';
import { parseDbml } from '../../src/dsl/parse.ts';

const ORACLE_FIXTURE = `
-- @layer: bronze
-- @group: ingestao
-- @note: Pedidos brutos
-- @fk: customer_id -> raw.customers.id
CREATE TABLE raw.orders (
  id NUMBER(19) NOT NULL,
  customer_id NUMBER(19),
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES raw.customers (id)
);

CREATE TABLE raw.customers (
  id NUMBER(19) NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (id)
);
`;

const COMPOSITE_PK = `
CREATE TABLE gold.report_revenue (
  period DATE,
  region STRING,
  segment STRING,
  total DECIMAL(18,2),
  PRIMARY KEY (period, region)
) USING DELTA;
`;

describe('detectSqlDialect', () => {
  it('detecta Oracle', () => {
    expect(detectSqlDialect(ORACLE_FIXTURE)).toBe('oracle');
  });
  it('detecta Spark', () => {
    expect(detectSqlDialect('CREATE TABLE t (a STRING) USING DELTA')).toBe('spark');
  });
});

describe('sqlToModel refs', () => {
  it('extrai FK de FOREIGN KEY e @fk', () => {
    const m = sqlToModel(ORACLE_FIXTURE);
    expect(m.tables).toHaveLength(2);
    expect(m.refs.length).toBeGreaterThanOrEqual(1);
    const fk = m.refs.find((r) => r.from.column === 'customer_id');
    expect(fk?.from.table).toBe('raw.orders');
    expect(fk?.to.table).toBe('raw.customers');
    expect(fk?.to.column).toBe('id');
  });
});

describe('sqlToModel composite PK', () => {
  it('preenche compositePks', () => {
    const m = sqlToModel(COMPOSITE_PK);
    const t = m.tables[0];
    expect(t.compositePks).toEqual([['period', 'region']]);
  });
});

describe('demo_lakehouse.sql', () => {
  it('não gera refs inválidas nem quebra o parse do DBML', () => {
    const sql = readFileSync(join(process.cwd(), 'data/input/demo_lakehouse.sql'), 'utf8');
    const m = sqlToModel(sql);
    const bogus = m.refs.find((r) => r.from.column === 'col' || r.to.table === 'tabela');
    expect(bogus).toBeUndefined();
    const ordersFk = m.refs.find(
      (r) => r.from.table === 'raw.orders' && r.from.column === 'customer_id',
    );
    expect(ordersFk?.to.table).toBe('raw.customers');
    const dbml = modelToDbml(m);
    const parsed = parseDbml(dbml);
    expect(parsed.error).toBeUndefined();
  });
});

describe('COMMENT ON Oracle', () => {
  it('aplica notes de tabela e coluna', () => {
    const m = sqlToModel(`
CREATE TABLE staging.t (
  id NUMBER(1) NOT NULL,
  nome VARCHAR2(10),
  CONSTRAINT pk_t PRIMARY KEY (id)
);
COMMENT ON TABLE staging.t IS 'Tabela T';
COMMENT ON COLUMN staging.t.nome IS 'Nome legivel';
`);
    const t = m.tables[0];
    expect(t.note).toBe('Tabela T');
    expect(t.noteInRecordsOnly).toBe(true);
    expect(t.columns.find((c) => c.name === 'nome')?.note).toBe('Nome legivel');
  });
});

describe('modelToDbml import notes', () => {
  it('@note vai para Records, não para Table', () => {
    const m = sqlToModel(`
-- @note: Apenas no records
CREATE TABLE t (id BIGINT, PRIMARY KEY (id)) USING DELTA;
INSERT INTO t (id) VALUES (1);
`);
    const t = m.tables[0];
    t.noteInRecordsOnly = true;
    const dbml = modelToDbml(m);
    expect(dbml).not.toMatch(/Table t \{[^}]*Note:/s);
    expect(dbml).toContain('Records t');
    expect(dbml).toContain("Note: 'Apenas no records'");
  });
});
