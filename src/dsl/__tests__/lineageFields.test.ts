import { describe, expect, it } from 'vitest';
import { parseDbml } from '../parse';
import { addFieldLineageEntry, removeFieldLineageEntry } from '../edit';

describe('LineageFields', () => {
  it('parseia bloco LineageFields', () => {
    const parsed = parseDbml(`
Table bronze.a { id bigint [pk] x string }
Table silver.b { id bigint [pk] y string }

LineageFields {
  silver.b.y < bronze.a.x [note: 'rename', ref: 'jobs/t.sql']
}
`);
    expect(parsed.lineageFields).toHaveLength(1);
    expect(parsed.lineageFields[0]).toMatchObject({
      sourceTable: 'bronze.a',
      sourceColumn: 'x',
      targetTable: 'silver.b',
      targetColumn: 'y',
      note: 'rename',
      ref: 'jobs/t.sql',
    });
  });

  it('add e remove mapeamento', () => {
    const base = `Table bronze.a { id bigint [pk] x string }\nTable silver.b { id bigint [pk] y string }\n`;
    const withMap = addFieldLineageEntry(base, 'bronze.a', 'x', 'silver.b', 'y', { note: 'n' });
    expect(withMap).toContain('LineageFields');
    expect(withMap).toContain('silver.b.y < bronze.a.x');
    const removed = removeFieldLineageEntry(withMap, 'bronze.a', 'x', 'silver.b', 'y');
    expect(removed).not.toContain('silver.b.y < bronze.a.x');
  });
});
