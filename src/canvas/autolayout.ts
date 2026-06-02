import dagre from 'dagre';
import type { ParseResult, TableView } from '../dsl/parse';
import type { Positions } from './hooks/useCanvasNodes';

const TABLE_W = 230;
const estHeight = (t: TableView, compact: boolean) =>
  compact ? 56 : 34 + t.columns.length * 25 + 26;

function layoutCluster(tables: TableView[], parsed: ParseResult, compact: boolean): Positions {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 90, marginx: 20, marginy: 20 });

  const ids = new Set(tables.map((t) => t.id));
  for (const t of tables) {
    g.setNode(t.id, { width: TABLE_W, height: estHeight(t, compact) });
  }

  for (const r of parsed.refs) {
    if (ids.has(r.source) && ids.has(r.target)) g.setEdge(r.source, r.target);
  }
  for (const entry of parsed.lineage) {
    if (!ids.has(entry.target)) continue;
    for (const src of entry.sources) {
      if (ids.has(src)) g.setEdge(src, entry.target);
    }
  }

  dagre.layout(g);

  const out: Positions = {};
  for (const t of tables) {
    const n = g.node(t.id);
    if (n) out[t.id] = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
  }
  return out;
}

/** Autolayout por TableGroup (clusters lado a lado). */
export function autolayoutPositions(parsed: ParseResult, compact = false): Positions {
  const byGroup = new Map<string, TableView[]>();
  for (const t of parsed.tables) {
    const key = t.group ?? '';
    byGroup.set(key, [...(byGroup.get(key) ?? []), t]);
  }

  const positions: Positions = {};
  let offsetX = 40;
  const GAP = 100;

  for (const tables of byGroup.values()) {
    const cluster = layoutCluster(tables, parsed, compact);
    let maxX = 0;
    let maxY = 0;
    for (const t of tables) {
      const p = cluster[t.id];
      if (!p) continue;
      positions[t.id] = { x: p.x + offsetX, y: p.y + 40 };
      maxX = Math.max(maxX, p.x + TABLE_W);
      maxY = Math.max(maxY, p.y + estHeight(t, compact));
    }
    offsetX += maxX + GAP;
  }

  return positions;
}
