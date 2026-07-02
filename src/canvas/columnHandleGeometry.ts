import type { Node } from 'reactflow';
import type { TableNodeData } from './actions';
import { nodeHeight, nodeWidth } from './nodeMetrics';
import {
  COLUMN_VIRTUAL_ROW_H,
  COLUMN_VIRTUALIZE_THRESHOLD,
  COLUMN_VIRTUAL_VIEW_ROWS,
} from './scaleLimits';

/** Alturas fixas alinhadas ao CSS / nodeMetrics. */
export const TABLE_HEADER_H = 34;
export const TABLE_EXTERNAL_BAR_H = 28;
export const TABLE_FOOTER_H = 26;

export const COLUMN_SCROLL_VIEW_H = COLUMN_VIRTUAL_VIEW_ROWS * COLUMN_VIRTUAL_ROW_H;

const PORT_INSET = 8;

export type ColumnAnchorKind = 'row' | 'above' | 'below';

export function needsScrollAwareHandles(data: TableNodeData | undefined): boolean {
  // Guarda `columns`: nós stub (grupos externos agregados) têm data sem columns
  // e não devem crashar o render de arestas ao filtrar por página/grupo.
  return !!data?.columns && data.columns.length > COLUMN_VIRTUALIZE_THRESHOLD;
}

export function columnScrollViewport(data: TableNodeData): { top: number; bottom: number; center: number } {
  const top = TABLE_HEADER_H + (data.externalLinks?.length ? TABLE_EXTERNAL_BAR_H : 0);
  const bottom = top + COLUMN_SCROLL_VIEW_H;
  return { top, bottom, center: top + (bottom - top) / 2 };
}

export function tableBodyHeight(data: TableNodeData): number {
  if (needsScrollAwareHandles(data)) {
    return (
      TABLE_HEADER_H
      + (data.externalLinks?.length ? TABLE_EXTERNAL_BAR_H : 0)
      + COLUMN_SCROLL_VIEW_H
      + TABLE_FOOTER_H
    );
  }
  return nodeHeight(data);
}

function clampLocalY(data: TableNodeData, y: number): number {
  const maxY = tableBodyHeight(data) - TABLE_FOOTER_H - PORT_INSET;
  const minY = TABLE_HEADER_H + (data.externalLinks?.length ? TABLE_EXTERNAL_BAR_H : 0) + PORT_INSET;
  return Math.max(minY, Math.min(maxY, y));
}

/** Y local (relativo ao topo do nó) do ponto de ligação. */
export function columnAnchorY(
  data: TableNodeData,
  columnName: string,
  scrollTop: number,
): { y: number; kind: ColumnAnchorKind } | null {
  const idx = data.columns.findIndex((c) => c.name === columnName);
  if (idx < 0) return null;

  const { top, bottom } = columnScrollViewport(data);

  if (!needsScrollAwareHandles(data)) {
    const y = top + idx * COLUMN_VIRTUAL_ROW_H + COLUMN_VIRTUAL_ROW_H / 2;
    return { y: clampLocalY(data, y), kind: 'row' };
  }

  const raw = top + idx * COLUMN_VIRTUAL_ROW_H - scrollTop + COLUMN_VIRTUAL_ROW_H / 2;
  const minY = top + PORT_INSET;
  const maxY = bottom - PORT_INSET;

  // Coluna acima da área visível: a ligação fica encostada na borda de cima,
  // esperando o usuário rolar para cima. Abaixo: encostada na borda de baixo.
  if (raw < minY) {
    return { y: clampLocalY(data, minY), kind: 'above' };
  }
  if (raw > maxY) {
    return { y: clampLocalY(data, maxY), kind: 'below' };
  }
  return { y: clampLocalY(data, raw), kind: 'row' };
}

export function sidePortFlowPoint(
  node: Node<TableNodeData>,
  side: 'source' | 'target',
): { x: number; y: number; kind: ColumnAnchorKind } {
  const { center } = columnScrollViewport(node.data);
  const origin = node.positionAbsolute ?? node.position;
  const w = node.width ?? nodeWidth(node.data) ?? 230;
  const xLocal = side === 'source' ? w : 0;
  const yLocal = clampLocalY(node.data, center);
  return { x: origin.x + xLocal, y: origin.y + yLocal, kind: 'row' };
}

export function columnHandleFlowPoint(
  node: Node<TableNodeData>,
  columnName: string,
  side: 'source' | 'target',
  scrollTop: number,
): { x: number; y: number; kind: ColumnAnchorKind } | null {
  const anchor = columnAnchorY(node.data, columnName, scrollTop);
  if (!anchor) return null;

  const origin = node.positionAbsolute ?? node.position;
  const w = node.width ?? nodeWidth(node.data) ?? 230;
  const xLocal = side === 'source' ? w : 0;
  return { x: origin.x + xLocal, y: origin.y + anchor.y, kind: anchor.kind };
}

export function parseRelationColumnHandle(
  handle: string | null | undefined,
): { side: 'source' | 'target'; column: string } | null {
  if (handle?.startsWith('s:')) return { side: 'source', column: handle.slice(2) };
  if (handle?.startsWith('t:')) return { side: 'target', column: handle.slice(2) };
  return null;
}

export function parseFieldLineageColumnHandle(
  handle: string | null | undefined,
): { side: 'source' | 'target'; column: string } | null {
  if (handle?.startsWith('fl:s:')) return { side: 'source', column: handle.slice(5) };
  if (handle?.startsWith('fl:t:')) return { side: 'target', column: handle.slice(5) };
  return null;
}
