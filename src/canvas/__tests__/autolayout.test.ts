import { describe, expect, it } from 'vitest';
import { parseDbml } from '../../dsl/parse';
import { autolayoutPositions } from '../autolayout';
import { nodeHeight, nodeWidth } from '../nodeMetrics';

const MARGIN = 16;

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return (
    ax < bx + bw + MARGIN &&
    ax + aw + MARGIN > bx &&
    ay < by + bh + MARGIN &&
    ay + ah + MARGIN > by
  );
}

function assertNoOverlaps(parsed: ReturnType<typeof parseDbml>, compact: boolean) {
  const pos = autolayoutPositions(parsed, compact);
  const metrics = { compact, layout: true as const };
  const tables = parsed.tables;
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i];
      const b = tables[j];
      const pa = pos[a.id];
      const pb = pos[b.id];
      if (!pa || !pb) continue;
      const overlap = rectsOverlap(
        pa.x,
        pa.y,
        nodeWidth(a, metrics),
        nodeHeight(a, metrics),
        pb.x,
        pb.y,
        nodeWidth(b, metrics),
        nodeHeight(b, metrics),
      );
      expect(overlap, `overlap ${a.id} vs ${b.id}`).toBe(false);
    }
  }
}

describe('autolayoutPositions', () => {
  it('posiciona todas as tabelas', () => {
    const parsed = parseDbml(`
Table loja.a {
  id bigint [pk]
}
Table loja.b {
  id bigint [pk]
}
Ref: loja.b.id > loja.a.id
`);
    const pos = autolayoutPositions(parsed);
    expect(pos['loja.a']).toBeDefined();
    expect(pos['loja.b']).toBeDefined();
    expect(pos['loja.a'].x).not.toBe(pos['loja.b'].x);
  });

  it('nao sobrepoe pares (modelo simples)', () => {
    const parsed = parseDbml(`
Table loja.a { id bigint [pk] }
Table loja.b { id bigint [pk] }
Ref: loja.b.id > loja.a.id
`);
    assertNoOverlaps(parsed, false);
  });

  it('separa clusters por schema quando @group vazio', () => {
    const parsed = parseDbml(`
Table bronze.t1 {
  id bigint [pk]
}
Table bronze.t2 {
  id bigint [pk]
}
Table silver.t3 {
  id bigint [pk]
}
Table silver.t4 {
  id bigint [pk]
}
`);
    expect(parsed.tables).toHaveLength(4);
    const pos = autolayoutPositions(parsed);
    const bronze = parsed.tables.filter((t) => t.id.startsWith('bronze.'));
    const silver = parsed.tables.filter((t) => t.id.startsWith('silver.'));
    const bronzeMax = Math.max(
      ...bronze.map((t) => pos[t.id].x + nodeWidth(t, {})),
    );
    const silverMin = Math.min(...silver.map((t) => pos[t.id].x));
    expect(silverMin).toBeGreaterThanOrEqual(bronzeMax);
    assertNoOverlaps(parsed, false);
  });

  it('nao sobrepoe componentes desconexos no mesmo grupo', () => {
    const parsed = parseDbml(`
TableGroup g {
  g.a
  g.b
  g.c
}
Table g.a {
  id bigint [pk]
}
Table g.b {
  id bigint [pk]
}
Table g.c {
  id bigint [pk]
}
Ref: g.c.id > g.b.id
`);
    expect(parsed.tables).toHaveLength(3);
    assertNoOverlaps(parsed, false);
    const pos = autolayoutPositions(parsed);
    expect(pos['g.a'].x).not.toBe(pos['g.b'].x);
  });

  it('nao sobrepoe modelo denso', () => {
    const tables = Array.from(
      { length: 18 },
      (_, i) => `Table m.t${i} {\n  id bigint [pk]\n  col_${i} string\n}`,
    ).join('\n');
    const refs = Array.from({ length: 8 }, (_, i) =>
      `Ref: m.t${i + 1}.id > m.t${i}.id`,
    ).join('\n');
    const parsed = parseDbml(`${tables}\n${refs}`);
    assertNoOverlaps(parsed, false);
  });

  it('modo compacto (linhagem) sem sobreposicao', () => {
    const parsed = parseDbml(`
Table a.x {
  id bigint [pk]
}
Table a.y {
  id bigint [pk]
  col1 string
  col2 string
}
Ref: a.y.id > a.x.id
`);
    assertNoOverlaps(parsed, true);
  });

  it('e deterministico', () => {
    const parsed = parseDbml(`
Table x.a { id bigint [pk] }
Table x.b { id bigint [pk] }
Ref: x.b.id > x.a.id
`);
    const p1 = autolayoutPositions(parsed);
    const p2 = autolayoutPositions(parsed);
    expect(p1).toEqual(p2);
  });

  it('nao sobrepoe muitas tabelas no mesmo TableGroup (dims isoladas)', () => {
    const parsed = parseDbml(`
TableGroup dimensao {
  ${Array.from({ length: 12 }, (_, i) => `dim.d${i}`).join('\n  ')}
}
${Array.from(
  { length: 12 },
  (_, i) => `Table dim.d${i} {\n  id bigint [pk]\n  nome string\n}`,
).join('\n')}
`);
    assertNoOverlaps(parsed, true);
  });

  it('bronze wide: menores empilhadas à esquerda, gigante em coluna à direita', () => {
    const smallCols = Array.from({ length: 3 }, (_, i) => `  c${i} string`).join('\n');
    const largeCols = Array.from({ length: 40 }, (_, i) => `  col_${i} string`).join('\n');
    const parsed = parseDbml(`
Table bronze.small_a {
  id bigint [pk]
${smallCols}
}
Table bronze.small_b {
  id bigint [pk]
${smallCols}
}
Table bronze.huge {
  id bigint [pk]
${largeCols}
}
`);
    const pos = autolayoutPositions(parsed, true);
    const smallA = pos['bronze.small_a'];
    const smallB = pos['bronze.small_b'];
    const huge = pos['bronze.huge'];
    expect(smallA.x).toBe(smallB.x);
    expect(smallA.y).toBeLessThan(smallB.y);
    expect(huge.x).toBeGreaterThan(smallA.x);
    expect(huge.y).toBe(smallA.y);
    assertNoOverlaps(parsed, true);
  });

  it('bronze wide: grade mais horizontal e compacta', () => {
    const tables = Array.from(
      { length: 11 },
      (_, i) => `Table bronze.t${i} {\n  id bigint [pk]\n}`,
    ).join('\n');
    const parsed = parseDbml(tables);
    const pos = autolayoutPositions(parsed, true);
    const ys = parsed.tables.map((t) => pos[t.id].y);
    const xs = parsed.tables.map((t) => pos[t.id].x);
    const rowSpread = Math.max(...ys) - Math.min(...ys);
    const colSpread = Math.max(...xs) - Math.min(...xs);
    expect(colSpread).toBeGreaterThan(rowSpread);
    assertNoOverlaps(parsed, true);
  });

  it('nao sobrepoe muitas bronze com nomes longos (modo linhagem)', () => {
    const tables = Array.from(
      { length: 11 },
      (_, i) =>
        `Table bronze.ts_000009_autorizacao_${i} {\n  id bigint [pk]\n  col_a string\n  col_b string\n}`,
    ).join('\n');
    const parsed = parseDbml(tables);
    assertNoOverlaps(parsed, true);
    const pos = autolayoutPositions(parsed, true);
    const xs = parsed.tables.map((t) => pos[t.id].x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });

  it('layout de ~50 tabelas em menos de 500ms', () => {
    const tables = Array.from(
      { length: 50 },
      (_, i) => `Table perf.t${i} {\n  id bigint [pk]\n}`,
    ).join('\n');
    const refs = Array.from({ length: 25 }, (_, i) =>
      `Ref: perf.t${i + 1}.id > perf.t${i}.id`,
    ).join('\n');
    const parsed = parseDbml(`${tables}\n${refs}`);
    const t0 = performance.now();
    autolayoutPositions(parsed);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
