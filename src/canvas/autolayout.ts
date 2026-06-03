import dagre from 'dagre';
import type { ParseResult, TableView } from '../dsl/parse';
import { tableLayerMap } from '../layers';
import type { Positions } from './hooks/useCanvasNodes';
import { nodeHeight, nodeWidth, type NodeMetricsOpts } from './nodeMetrics';

const MARGIN = 16;
const MAX_OVERLAP_ITER = 50;
const COMPONENT_GAP = 80;
const CLUSTER_PAD_Y = 40;

type Rect = { id: string; x: number; y: number; w: number; h: number };

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
    for (const src of entry.sources) bump(src, entry.target);
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

function dagreSpacing(n: number): { nodesep: number; ranksep: number } {
  const s = Math.sqrt(Math.max(1, n));
  return {
    nodesep: Math.max(48, Math.round(24 + 4 * s)),
    ranksep: Math.max(90, Math.round(50 + 8 * s)),
  };
}

function layoutSubset(
  tables: TableView[],
  parsed: ParseResult,
  metrics: NodeMetricsOpts,
): Positions {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  const { nodesep, ranksep } = dagreSpacing(tables.length);
  g.setGraph({ rankdir: 'LR', nodesep, ranksep, marginx: 20, marginy: 20 });

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

function layoutCluster(tables: TableView[], parsed: ParseResult, metrics: NodeMetricsOpts): Positions {
  const ids = new Set(tables.map((t) => t.id));
  const components = connectedComponents(ids, parsed);
  const tableById = new Map(tables.map((t) => [t.id, t] as const));

  const positions: Positions = {};
  let offsetY = 0;

  for (const memberIds of components) {
    const subset = memberIds.map((id) => tableById.get(id)!).filter(Boolean);
    if (!subset.length) continue;

    const local = layoutSubset(subset, parsed, metrics);
    let maxX = 0;
    let maxY = 0;
    for (const t of subset) {
      const p = local[t.id];
      if (!p) continue;
      positions[t.id] = { x: p.x, y: p.y + offsetY };
      maxX = Math.max(maxX, p.x + nodeWidth(t, metrics));
      maxY = Math.max(maxY, p.y + offsetY + nodeHeight(t, metrics));
    }
    offsetY = maxY + COMPONENT_GAP;
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

/** Empurra nós sobrepostos até separar (margem MARGIN). */
export function resolveOverlaps(
  positions: Positions,
  tables: TableView[],
  parsed: ParseResult,
  metrics: NodeMetricsOpts,
): Positions {
  const ids = new Set(tables.map((t) => t.id));
  const degree = buildDegreeMap(parsed, ids);
  const pos: Positions = { ...positions };

  for (let iter = 0; iter < MAX_OVERLAP_ITER; iter++) {
    let moved = false;
    const rects = toRects(pos, tables, metrics);
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
        if (pushX > 0 && (pushY <= 0 || pushX <= pushY)) {
          pos[moveId] = { ...pos[moveId], x: pos[moveId].x + pushX };
        } else if (pushY > 0) {
          pos[moveId] = { ...pos[moveId], y: pos[moveId].y + pushY };
        } else {
          pos[moveId] = { ...pos[moveId], x: pos[moveId].x + MARGIN + 1 };
        }
        moved = true;
        rects[moveA ? i : j] = toRects(pos, [tables.find((t) => t.id === moveId)!], metrics)[0];
      }
    }
    if (!moved) break;
  }

  return pos;
}

/** Autolayout por cluster (TableGroup → Layer/schema → default), sem sobreposição. */
export function autolayoutPositions(parsed: ParseResult, compact = false): Positions {
  const metrics: NodeMetricsOpts = { compact };
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
    const cluster = layoutCluster(tables, parsed, metrics);
    let clusterMaxX = offsetX;
    for (const t of tables) {
      const p = cluster[t.id];
      if (!p) continue;
      const x = p.x + offsetX;
      positions[t.id] = { x, y: p.y + CLUSTER_PAD_Y };
      clusterMaxX = Math.max(clusterMaxX, x + nodeWidth(t, metrics));
    }
    const clusterWidth = clusterMaxX - offsetX;
    const clusterGap = Math.max(100, Math.round(clusterWidth * 0.15));
    offsetX = clusterMaxX + clusterGap;
  }

  return resolveOverlaps(positions, parsed.tables, parsed, metrics);
}
