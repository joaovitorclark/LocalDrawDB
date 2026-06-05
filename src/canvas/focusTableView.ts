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
