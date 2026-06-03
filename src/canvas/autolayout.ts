import dagre from 'dagre';
import type { ParseResult, TableView } from '../dsl/parse';
import { tableLayerMap } from '../layers';
import type { Positions } from './hooks/useCanvasNodes';
import { nodeHeight, nodeWidth, type NodeMetricsOpts } from './nodeMetrics';

const MARGIN = 20;
const COMPONENT_GAP = 96;
const CLUSTER_PAD_Y = 40;
const GROUP_EXTRA_SEP = 24;

type Rect = { id: string; x: number; y: number; w: number; h: number };

function layoutMetrics(compact: boolean): NodeMetricsOpts {
  return { compact, layout: true };
}

function layerForTable(t: TableView, layerMap: Record<string, string>): string | undefined {
  if (layerMap[t.id]) return layerMap[t.id];
  if (t.schema?.trim()) return t.schema.trim();
  const dot = t.id.indexOf('.');
  if (dot > 0) return t.id.slice(0, dot);
  return undefined;
}

function clusterKey(t: TableView, layerMap: Record<string, string>): string {
  if (t.group?.trim()) return `group:${t.group.trim()}`;
  const layer = layerForTable(t, layerMap);
  if (layer) return `layer:${layer}`;
  return 'default';
}

function buildDegreeMap(parsed: ParseResult, ids: Set<string>): Map<string, number> {
  const deg = new Map<string, number>();
  for (const id of ids) deg.set(id, 0);
  const bump = (a: string, b: string) => {
    if (!ids.has(a) || !ids.has(b)) return;
    deg.set(a, (deg.get(a) ?? 0) + 1);
    deg.set(b, (deg.get(b) ?? 0) + 1);
  };
  for (const r of parsed.refs) bump(r.source, r.target);
  for (const entry of parsed.lineage) {
    if (!ids.has(entry.target)) continue;
    for (const src of entry.sources) {
      if (ids.has(src)) bump(src, entry.target);
    }
  }
  return deg;
}

function connectedComponents(ids: Set<string>, parsed: ParseResult): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x)!;
    while (p !== x) {
      const next = parent.get(p)!;
      parent.set(x, next);
      x = p;
      p = next;
    }
    return p;
  };
  const unite = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) parent.set(id, id);
  for (const r of parsed.refs) {
    if (ids.has(r.source) && ids.has(r.target)) unite(r.source, r.target);
  }
  for (const entry of parsed.lineage) {
    if (!ids.has(entry.target)) continue;
    for (const src of entry.sources) {
      if (ids.has(src)) unite(src, entry.target);
    }
  }
  const buckets = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    buckets.set(root, [...(buckets.get(root) ?? []), id]);
  }
  return [...buckets.values()].map((members) => members.sort());
}

function dagreSpacing(n: number, inGroup: boolean): { nodesep: number; ranksep: number } {
  const s = Math.sqrt(Math.max(1, n));
  const extra = inGroup ? GROUP_EXTRA_SEP : 0;
  return {
    nodesep: Math.max(56, Math.round(32 + 6 * s) + extra),
    ranksep: Math.max(100, Math.round(60 + 10 * s) + extra),
  };
}

function layoutSubset(
  tables: TableView[],
  parsed: ParseResult,
  metrics: NodeMetricsOpts,
  inGroup: boolean,
): Positions {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  const { nodesep, ranksep } = dagreSpacing(tables.length, inGroup);
  g.setGraph({ rankdir: 'LR', nodesep, ranksep, marginx: 24, marginy: 24 });

  const ids = new Set(tables.map((t) => t.id));
  for (const t of tables) {
    g.setNode(t.id, { width: nodeWidth(t, metrics), height: nodeHeight(t, metrics) });
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

/** Empacota tabelas isoladas (sem aresta entre si) em grade. */
function packSingletonGrid(
  tables: TableView[],
  metrics: NodeMetricsOpts,
  offsetY: number,
): { positions: Positions; maxY: number } {
  const positions: Positions = {};
  if (!tables.length) return { positions, maxY: offsetY };

  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const cellW =
    Math.max(...tables.map((t) => nodeWidth(t, metrics)), 0) + MARGIN;
  const cellH =
    Math.max(...tables.map((t) => nodeHeight(t, metrics)), 0) + MARGIN;

  let maxY = offsetY;
  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = offsetY + row * cellH;
    positions[t.id] = { x, y };
    maxY = Math.max(maxY, y + nodeHeight(t, metrics));
  });

  return { positions, maxY };
}

function layoutCluster(
  tables: TableView[],
  parsed: ParseResult,
  metrics: NodeMetricsOpts,
  inGroup: boolean,
): Positions {
  const ids = new Set(tables.map((t) => t.id));
  const components = connectedComponents(ids, parsed);
  const tableById = new Map(tables.map((t) => [t.id, t] as const));

  const positions: Positions = {};
  let offsetY = 0;
  const singletons: TableView[] = [];

  for (const memberIds of components) {
    if (memberIds.length === 1) {
      const t = tableById.get(memberIds[0]);
      if (t) singletons.push(t);
      continue;
    }

    const subset = memberIds.map((id) => tableById.get(id)!).filter(Boolean);
    const local = layoutSubset(subset, parsed, metrics, inGroup);
    let maxY = offsetY;
    for (const t of subset) {
      const p = local[t.id];
      if (!p) continue;
      positions[t.id] = { x: p.x, y: p.y + offsetY };
      maxY = Math.max(maxY, p.y + offsetY + nodeHeight(t, metrics));
    }
    offsetY = maxY + COMPONENT_GAP;
  }

  if (singletons.length) {
    const packed = packSingletonGrid(singletons, metrics, offsetY);
    Object.assign(positions, packed.positions);
    offsetY = packed.maxY + COMPONENT_GAP;
  }

  return positions;
}

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x < b.x + b.w + margin &&
    a.x + a.w + margin > b.x &&
    a.y < b.y + b.h + margin &&
    a.y + a.h + margin > b.y
  );
}

function toRects(positions: Positions, tables: TableView[], metrics: NodeMetricsOpts): Rect[] {
  return tables
    .filter((t) => positions[t.id])
    .map((t) => ({
      id: t.id,
      x: positions[t.id].x,
      y: positions[t.id].y,
      w: nodeWidth(t, metrics),
      h: nodeHeight(t, metrics),
    }));
}

function countOverlaps(rects: Rect[], margin: number): number {
  let n = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j], margin)) n++;
    }
  }
  return n;
}

/** Empurra nós sobrepostos (só entre as tabelas do conjunto passado). */
export function resolveOverlaps(
  positions: Positions,
  tables: TableView[],
  parsed: ParseResult,
  metrics: NodeMetricsOpts,
): Positions {
  const ids = new Set(tables.map((t) => t.id));
  const degree = buildDegreeMap(parsed, ids);
  const pos: Positions = { ...positions };
  const maxIter = Math.max(80, tables.length * 8);

  for (let iter = 0; iter < maxIter; iter++) {
    const rects = toRects(pos, tables, metrics);
    if (countOverlaps(rects, MARGIN) === 0) break;

    let moved = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (!rectsOverlap(a, b, MARGIN)) continue;

        const moveA = (degree.get(a.id) ?? 0) <= (degree.get(b.id) ?? 0);
        const moveId = moveA ? a.id : b.id;
        const self = moveA ? a : b;
        const other = moveA ? b : a;

        const pushX = other.x + other.w + MARGIN - self.x;
        const pushY = other.y + other.h + MARGIN - self.y;
        const cur = pos[moveId];
        if (pushX > 0) {
          pos[moveId] = { x: cur.x + pushX, y: cur.y };
          moved = true;
        }
        if (pushY > 0) {
          pos[moveId] = { x: pos[moveId].x, y: pos[moveId].y + pushY };
          moved = true;
        }
        if (pushX <= 0 && pushY <= 0) {
          pos[moveId] = { x: cur.x + MARGIN + 1, y: cur.y };
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return pos;
}

/** Autolayout por cluster (TableGroup → Layer/schema → default), sem sobreposição. */
export function autolayoutPositions(parsed: ParseResult, compact = false): Positions {
  const metrics = layoutMetrics(compact);
  const layerMap = tableLayerMap(parsed.layerGroups);

  const byCluster = new Map<string, TableView[]>();
  for (const t of parsed.tables) {
    const key = clusterKey(t, layerMap);
    byCluster.set(key, [...(byCluster.get(key) ?? []), t]);
  }

  const positions: Positions = {};
  let offsetX = 40;
  const sortedKeys = [...byCluster.keys()].sort();

  for (const key of sortedKeys) {
    const tables = byCluster.get(key)!;
    const inGroup = key.startsWith('group:');
    let cluster = layoutCluster(tables, parsed, metrics, inGroup);
    cluster = resolveOverlaps(cluster, tables, parsed, metrics);

    let clusterMaxX = offsetX;
    for (const t of tables) {
      const p = cluster[t.id];
      if (!p) continue;
      const x = p.x + offsetX;
      positions[t.id] = { x, y: p.y + CLUSTER_PAD_Y };
      clusterMaxX = Math.max(clusterMaxX, x + nodeWidth(t, metrics));
    }
    const clusterWidth = clusterMaxX - offsetX;
    const clusterGap = Math.max(120, Math.round(clusterWidth * 0.18));
    offsetX = clusterMaxX + clusterGap;
  }

  return positions;
}
