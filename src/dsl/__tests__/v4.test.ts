import { describe, expect, it } from 'vitest';
import { addLineage, removeLineage, lineageFromJson } from '../lineage';
import { allLayers, layerColorOf, BUILTIN_LAYERS } from '../../layers';
import { parseDbml } from '../parse';

describe('lineage helpers', () => {
  it('addLineage dedupe + sem self-loop', () => {
    let l = addLineage([], 'a', 'b');
    expect(l).toHaveLength(1);
    l = addLineage(l, 'a', 'b'); // duplicata
    expect(l).toHaveLength(1);
    l = addLineage(l, 'x', 'x'); // self-loop
    expect(l).toHaveLength(1);
  });
  it('removeLineage', () => {
    const l = removeLineage([{ source: 'a', target: 'b' }], 'a', 'b');
    expect(l).toHaveLength(0);
  });
  it('lineageFromJson', () => {
    const l = lineageFromJson({ 'silver.x': ['bronze.y', 'bronze.z'] });
    expect(l).toEqual([
      { source: 'bronze.y', target: 'silver.x' },
      { source: 'bronze.z', target: 'silver.x' },
    ]);
  });
});

describe('layers helpers', () => {
  it('allLayers mescla builtins sem duplicar ids', () => {
    const merged = allLayers([{ id: 'bronze', name: 'B', color: '#000' }, { id: 'q', name: 'Q', color: '#111' }]);
    expect(merged.filter((l) => l.id === 'bronze')).toHaveLength(1); // builtin vence
    expect(merged.some((l) => l.id === 'q')).toBe(true);
  });
  it('layerColorOf', () => {
    expect(layerColorOf(BUILTIN_LAYERS, 'prata')).toBe('#9ca3af');
    expect(layerColorOf(BUILTIN_LAYERS, undefined)).toBeUndefined();
  });
});

describe('parser captura notes (F5)', () => {
  it('note de tabela e de coluna', () => {
    const dbml = `Table mart.dim_cliente {
  id bigint [pk, note: 'chave']
  nome string
  Note: 'dimensão de clientes'
}`;
    const m = parseDbml(dbml);
    const t = m.tables[0];
    expect(t.note).toBe('dimensão de clientes');
    expect(t.columns.find((c) => c.name === 'id')!.note).toBe('chave');
  });
});
