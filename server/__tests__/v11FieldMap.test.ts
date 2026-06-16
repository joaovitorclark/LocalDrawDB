import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dbmlToModel, modelToDbml } from '../dbmlIo.ts';
import { mergeModel, sqlToModel } from '../sqlImport.ts';
import { modelToInputSql } from '../sqlExport.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const complexSql = readFileSync(
  path.join(dir, '..', '..', 'examples', 'input', 'demo_lakehouse_complex.sql'),
  'utf8',
);

// Conta mapeamentos L2 em comentário (formato antigo `@map <-` e novo rodapé `col <- src`).
function countLineageMaps(sql: string): number {
  return (sql.match(/--[^\n]*<-/g) ?? []).length;
}

describe('v11-04 demo_lakehouse_complex L2', () => {
  it('sqlToModel popula lineageFields incluindo line_id', () => {
    const model = sqlToModel(complexSql);
    expect(model.lineageFields?.length).toBeGreaterThan(30);
    expect(
      model.lineageFields?.some(
        (f) =>
          f.targetTable === 'silver.stg_order_lines' &&
          f.targetColumn === 'line_id' &&
          f.sourceTable === 'raw.erp_order_lines' &&
          f.sourceColumn === 'line_id',
      ),
    ).toBe(true);
  });

  it('export Oracle emite rodapé @lineage para line_id', () => {
    const model = sqlToModel(complexSql);
    const oracleSql = modelToInputSql(model, 'oracle');
    expect(oracleSql).toContain('-- @lineage silver.stg_order_lines');
    expect(oracleSql).toMatch(/--\s+line_id <- raw\.erp_order_lines\.line_id/);
  });

  it('round-trip preserva ≥95% dos mapeamentos L2 da fixture', () => {
    const sourceMaps = countLineageMaps(complexSql);
    expect(sourceMaps).toBeGreaterThan(50);

    const model0 = sqlToModel(complexSql);
    const dbml = modelToDbml(model0);
    const model1 = dbmlToModel(dbml);
    const exported = modelToInputSql(model1, 'oracle');
    const model2 = sqlToModel(exported);

    const roundMaps = countLineageMaps(exported);
    const preservedRatio = roundMaps / sourceMaps;
    expect(preservedRatio).toBeGreaterThanOrEqual(0.95);
    expect(model2.lineageFields?.length).toBeGreaterThanOrEqual(
      Math.floor((model0.lineageFields?.length ?? 0) * 0.95),
    );
  });

  it('mergeModel preserva L2 do editor e do input', () => {
    const editorDbml = `Table raw.erp_order_lines {
  line_id bigint [pk]
}
Table silver.stg_order_lines {
  line_id bigint [pk]
  order_id bigint
}

LineageFields {
  silver.stg_order_lines.line_id < raw.erp_order_lines.line_id
}
`;
    const inputSql = `
CREATE TABLE silver.stg_order_lines (
  line_id BIGINT,
  order_id BIGINT, -- @map <- raw.erp_orders.order_id
  PRIMARY KEY (line_id)
) USING DELTA;
CREATE TABLE raw.erp_orders (
  order_id BIGINT,
  PRIMARY KEY (order_id)
) USING DELTA;
`;

    const base = dbmlToModel(editorDbml);
    const incoming = sqlToModel(inputSql);
    const merged = mergeModel(base, incoming);
    const dbml = modelToDbml(merged);

    expect(dbml).toContain('silver.stg_order_lines.line_id < raw.erp_order_lines.line_id');
    expect(dbml).toContain('silver.stg_order_lines.order_id < raw.erp_orders.order_id');
    expect(merged.lineageFields).toHaveLength(2);
  });
});
