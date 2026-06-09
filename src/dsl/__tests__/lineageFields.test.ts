import { describe, expect, it } from 'vitest';
import { parseDbml } from '../parse';
import { addFieldLineageEntry, removeFieldLineageEntry, updateFieldLineageEntry } from '../edit';

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

  it('atualiza mapeamento incluindo origem/destino', () => {
    const base = `Table bronze.a { id bigint [pk] x string }\nTable bronze.c { id bigint [pk] z string }\nTable silver.b { id bigint [pk] y string w string }\n`;
    const withMap = addFieldLineageEntry(base, 'bronze.a', 'x', 'silver.b', 'y', { note: 'n' });
    const updated = updateFieldLineageEntry(
      withMap,
      { sourceTable: 'bronze.a', sourceColumn: 'x', targetTable: 'silver.b', targetColumn: 'y' },
      { sourceTable: 'bronze.c', sourceColumn: 'z', targetTable: 'silver.b', targetColumn: 'w', note: 'm', ref: 'jobs/t.sql' },
    );
    expect(updated).not.toContain('silver.b.y < bronze.a.x');
    expect(updated).toContain("silver.b.w < bronze.c.z [note: 'm', ref: 'jobs/t.sql']");
  });
});
