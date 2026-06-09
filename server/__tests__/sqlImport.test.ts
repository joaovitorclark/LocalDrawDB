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

  it('extrai FK composta (2 colunas) e gera um Ref por par', () => {
    const m = sqlToModel(`
CREATE TABLE silver.fato_item (
  num_pedido STRING,
  num_seq SMALLINT,
  CONSTRAINT pk_item PRIMARY KEY (num_pedido, num_seq),
  CONSTRAINT fk_item_seq FOREIGN KEY (num_pedido, num_seq)
    REFERENCES silver.fato_seq (num_pedido, num_seq)
) USING DELTA;
CREATE TABLE silver.fato_seq (
  num_pedido STRING,
  num_seq SMALLINT,
  CONSTRAINT pk_seq PRIMARY KEY (num_pedido, num_seq)
) USING DELTA;
`);
    const pairs = m.refs.filter((r) => r.from.table === 'silver.fato_item');
    expect(pairs).toHaveLength(2);
    expect(pairs.map((r) => r.from.column).sort()).toEqual(['num_pedido', 'num_seq']);
    expect(pairs.every((r) => r.to.table === 'silver.fato_seq')).toBe(true);
  });

  it('extrai FK composta de 3 colunas', () => {
    const m = sqlToModel(`
CREATE TABLE silver.msg (
  a STRING,
  b SMALLINT,
  c SMALLINT,
  CONSTRAINT fk_msg_item FOREIGN KEY (a, b, c)
    REFERENCES silver.item (a, b, c)
) USING DELTA;
CREATE TABLE silver.item (
  a STRING,
  b SMALLINT,
  c SMALLINT,
  PRIMARY KEY (a, b, c)
) USING DELTA;
`);
    expect(m.refs.filter((r) => r.from.table === 'silver.msg')).toHaveLength(3);
  });

  it('dedupe CONSTRAINT composta e @fk por coluna', () => {
    const m = sqlToModel(`
-- @fk: num_pedido -> silver.seq.num_pedido
-- @fk: num_seq -> silver.seq.num_seq
CREATE TABLE silver.child (
  num_pedido STRING,
  num_seq SMALLINT,
  CONSTRAINT fk_child FOREIGN KEY (num_pedido, num_seq)
    REFERENCES silver.seq (num_pedido, num_seq)
) USING DELTA;
CREATE TABLE silver.seq (
  num_pedido STRING,
  num_seq SMALLINT,
  PRIMARY KEY (num_pedido, num_seq)
) USING DELTA;
`);
    expect(m.refs.filter((r) => r.from.table === 'silver.child')).toHaveLength(2);
  });

  it('avisa e ignora FK com aridade divergente', () => {
    const m = sqlToModel(`
CREATE TABLE silver.bad (
  a STRING,
  b STRING,
  CONSTRAINT fk_bad FOREIGN KEY (a, b) REFERENCES silver.tgt (a)
) USING DELTA;
CREATE TABLE silver.tgt (a STRING, PRIMARY KEY (a)) USING DELTA;
`);
    expect(m.refs.filter((r) => r.from.table === 'silver.bad')).toHaveLength(0);
    expect(m.warnings?.some((w) => /silver\.bad/i.test(w) && /!=/i.test(w))).toBe(true);
  });
});

describe('sqlToModel composite PK', () => {
  it('preenche compositePks', () => {
    const m = sqlToModel(COMPOSITE_PK);
    const t = m.tables[0];
    expect(t.compositePks).toEqual([['period', 'region']]);
  });
});

describe('sqlToModel lineage L1 @origen', () => {
  it('extrai @origen simples e múltiplas origens', () => {
    const m = sqlToModel(`
CREATE TABLE raw.a (id BIGINT, PRIMARY KEY (id)) USING DELTA;
CREATE TABLE raw.b (id BIGINT, PRIMARY KEY (id)) USING DELTA;
-- @origen: raw.a
-- @origem: raw.b
CREATE TABLE silver.f (id BIGINT, PRIMARY KEY (id)) USING DELTA;
`);
    const entry = m.lineage?.find((l) => l.target === 'silver.f');
    expect(entry?.sources.sort()).toEqual(['raw.a', 'raw.b']);
  });
});

describe('sqlToModel lineage L2 @map inline', () => {
  it('extrai @map inline com note/ref e alias @mapeamento', () => {
    const m = sqlToModel(`
CREATE TABLE raw.src (
  id BIGINT,
  nome STRING,
  PRIMARY KEY (id)
) USING DELTA;
-- @origen: raw.src
CREATE TABLE silver.tgt (
  cod BIGINT, -- @map <- raw.src.id
  nom STRING, -- @mapeamento <- raw.src.nome [note: 'upper', ref: 'jobs/tgt.sql']
  PRIMARY KEY (cod)
) USING DELTA;
`);
    expect(m.lineage?.[0]).toEqual({ target: 'silver.tgt', sources: ['raw.src'] });
    expect(m.lineageFields).toHaveLength(2);
    const nom = m.lineageFields?.find((f) => f.targetColumn === 'nom');
    expect(nom).toMatchObject({
      sourceTable: 'raw.src',
      sourceColumn: 'nome',
      note: 'upper',
      ref: 'jobs/tgt.sql',
    });
  });

  it('avisa quando origem @map não existe', () => {
    const m = sqlToModel(`
CREATE TABLE silver.t (
  x BIGINT, -- @map <- missing.tbl.col
  PRIMARY KEY (x)
) USING DELTA;
`);
    expect(m.warnings?.some((w) => /@map.*missing\.tbl/i.test(w))).toBe(true);
  });
});

describe('demo_lakehouse.sql', () => {
  it('não gera refs inválidas nem quebra o parse do DBML', () => {
    const sql = readFileSync(join(process.cwd(), 'examples/input/demo_lakehouse.sql'), 'utf8');
    const m = sqlToModel(sql);
    const bogus = m.refs.find((r) => r.from.column === 'col' || r.to.table === 'tabela');
    expect(bogus).toBeUndefined();
    const ordersFk = m.refs.find(
      (r) => r.from.table === 'raw.orders' && r.from.column === 'customer_id',
    );
    expect(ordersFk?.to.table).toBe('raw.customers');
    expect(m.lineage?.some((l) => l.target === 'silver.dim_customer')).toBe(true);
    expect(m.lineageFields?.length).toBeGreaterThan(5);
    const dbml = modelToDbml(m);
    expect(dbml).toContain('Lineage {');
    expect(dbml).toContain('LineageFields {');
    const parsed = parseDbml(dbml);
    expect(parsed.error).toBeUndefined();
    expect(parsed.lineage.length).toBeGreaterThan(0);
  });
});

describe('demo_lakehouse_complex.sql', () => {
  it('importa hierarquia ampla de linhagem sem quebrar parse', () => {
    const sql = readFileSync(join(process.cwd(), 'examples/input/demo_lakehouse_complex.sql'), 'utf8');
    const m = sqlToModel(sql);
    expect(m.tables.length).toBeGreaterThanOrEqual(20);
    expect(m.lineage?.length).toBeGreaterThanOrEqual(10);
    expect(m.lineageFields?.length).toBeGreaterThanOrEqual(50);
    expect(m.lineage?.some((l) => l.target === 'gold.report_exec_dashboard')).toBe(true);
    expect(
      m.lineage?.some(
        (l) =>
          l.target === 'silver.stg_order_lines' &&
          l.sources?.includes('raw.erp_order_lines'),
      ),
    ).toBe(true);
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
