import type { Node } from 'reactflow';

/** Altura máxima usada ao enquadrar/focar — evita zoom extremo em tabelas com muitas colunas. */
export const FOCUS_HEIGHT_CAP = 420;

export type FlowBounds = { x: number; y: number; width: number; height: number };

export function tableFocusBounds(
  node: Pick<Node, 'position' | 'width' | 'height'>,
  cap = FOCUS_HEIGHT_CAP,
): FlowBounds | null {
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  if (!w || !h) return null;
  return {
    x: node.position.x,
    y: node.position.y,
    width: w,
    height: Math.min(h, cap),
  };
}

/** Bounds do diagrama ignorando a “cauda” de colunas além de `cap` por tabela. */
export function diagramOverviewBounds(
  nodes: Node[],
  cap = FOCUS_HEIGHT_CAP,
): FlowBounds | null {
  const visible = nodes.filter((n) => n.type === 'table' && !n.hidden && n.width && n.height);
  if (!visible.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of visible) {
    const w = n.width ?? 0;
    const h = Math.min(n.height ?? 0, cap);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type SetCenterFn = (
  x: number,
  y: number,
  options?: { zoom?: number; duration?: number },
) => void;

/** Centraliza no cartão da tabela sem reduzir o zoom por causa de centenas de linhas. */
export function focusTableInView(
  getNode: (id: string) => Node | undefined,
  setCenter: SetCenterFn,
  tableId: string,
): boolean {
  const node = getNode(tableId);
  if (!node || node.hidden || node.type !== 'table') return false;
  const bounds = tableFocusBounds(node);
  if (!bounds) return false;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height * 0.4;
  const fullH = node.height ?? bounds.height;
  const zoom = fullH > FOCUS_HEIGHT_CAP * 2 ? 0.55 : 0.82;
  setCenter(cx, cy, { zoom, duration: 280 });
  return true;
}

export type FitBoundsFn = (
  bounds: FlowBounds,
  options?: { padding?: number; duration?: number },
) => void;

/** Enquadra origem e destino de um mapeamento L2 no viewport. */
export function fieldMappingFocusBounds(
  getNode: (id: string) => Node | undefined,
  sourceTable: string,
  targetTable: string,
): FlowBounds | null {
  const src = getNode(sourceTable);
  const tgt = getNode(targetTable);
  if (!src || !tgt || src.hidden || tgt.hidden || src.type !== 'table' || tgt.type !== 'table') {
    return null;
  }
  const sb = tableFocusBounds(src);
  const tb = tableFocusBounds(tgt);
  if (!sb || !tb) return null;
  const minX = Math.min(sb.x, tb.x);
  const minY = Math.min(sb.y, tb.y);
  const maxX = Math.max(sb.x + sb.width, tb.x + tb.width);
  const maxY = Math.max(sb.y + sb.height, tb.y + tb.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function focusFieldMappingInView(
  getNode: (id: string) => Node | undefined,
  fitBounds: FitBoundsFn,
  sourceTable: string,
  targetTable: string,
): boolean {
  const bounds = fieldMappingFocusBounds(getNode, sourceTable, targetTable);
  if (!bounds) return false;
  fitBounds(bounds, { padding: 0.18, duration: 320 });
  return true;
}
