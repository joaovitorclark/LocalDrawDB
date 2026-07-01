import { describe, expect, it } from 'vitest';
import { splitDbmlBlocks } from '../blocks';
import { parseColorsBlock, cleanDbml } from '../dbmlClean';
import { parseDbml } from '../parse';
import { setTableColor } from '../edit';

describe('bloco Colors', () => {
  it('tokeniza como colors', () => {
    const blocks = splitDbmlBlocks('Colors {\n  a.b: #b08d57\n}\n');
    expect(blocks.some((x) => x.type === 'colors')).toBe(true);
  });
  it('parseColorsBlock parseia table: #hex', () => {
    expect(parseColorsBlock('Colors {\n  silver.fato: #b08d57\n}')).toEqual([
      { table: 'silver.fato', color: '#b08d57' },
    ]);
  });
  it('cleanDbml remove o bloco (DDL ignora)', () => {
    const src = 'Table t {\n  id int\n}\nColors {\n  t: #ffffff\n}';
    expect(cleanDbml(src)).not.toMatch(/Colors/i);
  });
  it('parseDbml expõe colors como record', () => {
    const src = 'Table t {\n  id int\n}\nColors {\n  t: #b08d57\n}';
    expect(parseDbml(src).colors).toEqual({ t: '#b08d57' });
  });
});

describe('setTableColor', () => {
  it('cria o bloco e adiciona a cor', () => {
    const out = setTableColor('Table t {\n  id int\n}\n', 't', '#b08d57');
    expect(out).toMatch(/Colors\s*\{/);
    expect(out).toContain('t: #b08d57');
  });
  it('atualiza a cor existente sem duplicar', () => {
    const a = setTableColor('', 't', '#111111');
    const b = setTableColor(a, 't', '#222222');
    expect((b.match(/t:/g) ?? []).length).toBe(1);
    expect(b).toContain('t: #222222');
  });
  it('remove com color=null (e o bloco se ficar vazio)', () => {
    const a = setTableColor('', 't', '#111111');
    const out = setTableColor(a, 't', null);
    expect(out).not.toMatch(/Colors/i);
  });
});
