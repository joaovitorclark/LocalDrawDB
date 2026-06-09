import type { CSSProperties } from 'react';
import { Position } from 'reactflow';
import type { TableView } from '../dsl/parse';
import { nodeHeight, nodeWidth } from './nodeMetrics';

export type LineagePort = {
  id: string;
  position: Position;
  style: CSSProperties;
};

/** Um ponto por lado, no meio da borda (4 portas por tabela). */
export const LINEAGE_PORTS: LineagePort[] = [
  { id: 'lin-l', position: Position.Left, style: { top: '50%' } },
  { id: 'lin-r', position: Position.Right, style: { top: '50%' } },
  { id: 'lin-t', position: Position.Top, style: { left: '50%' } },
  { id: 'lin-b', position: Position.Bottom, style: { left: '50%' } },
];

export const DEFAULT_LINEAGE_SOURCE = 'lin-r-s';
export const DEFAULT_LINEAGE_TARGET = 'lin-l-t';

const FALLBACK_W = 230;
const FALLBACK_H = 120;

/** Escolhe portas de saída/entrada pelo lado mais curto entre os dois nós. */
export function pickLineageHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceTable?: TableView,
  targetTable?: TableView,
): { sourceHandle: string; targetHandle: string } {
  const sourceW = sourceTable ? nodeWidth(sourceTable) : FALLBACK_W;
  const sourceH = sourceTable ? nodeHeight(sourceTable) : FALLBACK_H;
  const targetW = targetTable ? nodeWidth(targetTable) : FALLBACK_W;
  const targetH = targetTable ? nodeHeight(targetTable) : FALLBACK_H;

  const scx = sourcePos.x + sourceW / 2;
  const tcx = targetPos.x + targetW / 2;
  const scy = sourcePos.y + sourceH / 2;
  const tcy = targetPos.y + targetH / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx <= 0) {
      return { sourceHandle: 'lin-l-s', targetHandle: 'lin-r-t' };
    }
    return { sourceHandle: 'lin-r-s', targetHandle: 'lin-l-t' };
  }
  if (dy <= 0) {
    return { sourceHandle: 'lin-t-s', targetHandle: 'lin-b-t' };
  }
  return { sourceHandle: 'lin-b-s', targetHandle: 'lin-t-t' };
}

export function isLineageHandle(id: string | null | undefined): boolean {
  return !!id && /^lin-[lrtb]-[st]$/.test(id);
}
