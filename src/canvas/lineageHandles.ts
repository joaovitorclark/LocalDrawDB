import type { CSSProperties } from 'react';
import { Position } from 'reactflow';

export type LineagePort = {
  id: string;
  position: Position;
  style: CSSProperties;
};

/** 3 pontos por lado na borda do cartão (estilo draw.io). */
function sidePorts(
  side: 'l' | 'r' | 't' | 'b',
  position: Position,
  axis: 'top' | 'left',
  values: string[],
): LineagePort[] {
  return values.map((v, i) => ({
    id: `lin-${side}-${i}`,
    position,
    style: axis === 'top' ? { top: v } : { left: v },
  }));
}

export const LINEAGE_PORTS: LineagePort[] = [
  ...sidePorts('l', Position.Left, 'top', ['22%', '50%', '78%']),
  ...sidePorts('r', Position.Right, 'top', ['22%', '50%', '78%']),
  ...sidePorts('t', Position.Top, 'left', ['25%', '50%', '75%']),
  ...sidePorts('b', Position.Bottom, 'left', ['25%', '50%', '75%']),
];

export const DEFAULT_LINEAGE_SOURCE = 'lin-r-1-s';
export const DEFAULT_LINEAGE_TARGET = 'lin-l-1-t';

const LINEAGE_CARD_W = 230;
const LINEAGE_CARD_H = 56;

/** Escolhe portas de saída/entrada pelo lado mais curto entre os dois nós. */
export function pickLineageHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceW = LINEAGE_CARD_W,
  targetW = LINEAGE_CARD_W,
): { sourceHandle: string; targetHandle: string } {
  const scx = sourcePos.x + sourceW / 2;
  const tcx = targetPos.x + targetW / 2;
  const scy = sourcePos.y + LINEAGE_CARD_H / 2;
  const tcy = targetPos.y + LINEAGE_CARD_H / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx <= 0) {
      return { sourceHandle: 'lin-l-1-s', targetHandle: 'lin-r-1-t' };
    }
    return { sourceHandle: 'lin-r-1-s', targetHandle: 'lin-l-1-t' };
  }
  if (dy <= 0) {
    return { sourceHandle: 'lin-t-1-s', targetHandle: 'lin-b-1-t' };
  }
  return { sourceHandle: 'lin-b-1-s', targetHandle: 'lin-t-1-t' };
}

export function isLineageHandle(id: string | null | undefined): boolean {
  return !!id?.startsWith('lin-');
}
