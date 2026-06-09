import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dbmlToModel, modelToDbml } from '../dbmlIo.ts';
import { sqlToModel } from '../sqlImport.ts';
import { modelToInputSql } from '../sqlExport.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const demoSql = readFileSync(
  path.join(dir, '..', '..', 'examples', 'input', 'demo_lakehouse.sql'),
  'utf8',
);

describe('export input SQL', () => {
  it('demo_lakehouse import → export Spark contém tabelas e metadados', () => {
    const imported = sqlToModel(demoSql);
    expect(imported.tables.length).toBeGreaterThan(3);
    const sparkSql = modelToInputSql(imported, 'spark');
    expect(sparkSql).toContain('-- @layer: bronze');
    expect(sparkSql).toContain('CREATE TABLE IF NOT EXISTS raw.orders');
    expect(sparkSql).toContain('USING DELTA');
    expect(sparkSql).toContain('INSERT INTO raw.orders');
    expect(sparkSql).toContain('PRIMARY KEY (period, region)');
  });

  it('export Oracle gera VARCHAR2/NUMBER e CONSTRAINT FK', () => {
    const imported = sqlToModel(demoSql);
    const oracleTables = imported.tables.filter((t) => t.schema === 'staging');
    const oracleSql = modelToInputSql({ tables: oracleTables, refs: imported.refs }, 'oracle');
    expect(oracleSql).toContain('CREATE TABLE staging.cliente');
    expect(oracleSql).toContain('VARCHAR2');
    expect(oracleSql).toContain('NUMBER');
    expect(oracleSql).toContain('FOREIGN KEY');
  });

  it('round-trip básico: DBML enriquecido → export → reimport preserva layer e refs', () => {
    const model0 = sqlToModel(demoSql);
    const dbml = modelToDbml(model0);
    const model1 = dbmlToModel(dbml);
    const exported = modelToInputSql(model1, 'spark');
    const model2 = sqlToModel(exported);

    const orders0 = model0.tables.find((t) => t.name === 'orders' && t.schema === 'raw')!;
    const orders2 = model2.tables.find((t) => t.name === 'orders' && t.schema === 'raw')!;
    expect(orders2.layer).toBe(orders0.layer);
    expect(orders2.group).toBe(orders0.group);
    expect(model2.refs.some((r) => r.from.column === 'customer_id')).toBe(true);
    expect(orders2.records?.rows.length).toBeGreaterThan(0);
    expect(model1.lineage?.length).toBe(model0.lineage?.length);
    expect(model1.lineageFields?.length).toBe(model0.lineageFields?.length);
  });

  it('export emite @origen e @map inline', () => {
    const model = sqlToModel(demoSql);
    const sparkSql = modelToInputSql(model, 'spark');
    expect(sparkSql).toContain('-- @origen: raw.customers');
    expect(sparkSql).toContain('-- @map <- raw.customers.id');
    expect(sparkSql).toContain("note: 'SUM(total) por periodo/regiao'");
  });
});
