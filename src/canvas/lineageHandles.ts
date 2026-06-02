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

export function isLineageHandle(id: string | null | undefined): boolean {
  return !!id?.startsWith('lin-');
}
