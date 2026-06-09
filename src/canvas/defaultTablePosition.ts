import type { Positions } from './hooks/useCanvasNodes';

/** Posição inicial para tabela nova no canvas (grade leve, evita sobreposição óbvia). */
export function defaultTablePosition(existing: Positions, indexHint = 0): { x: number; y: number } {
  const n = Object.keys(existing).length + indexHint;
  return { x: 100 + (n % 4) * 300, y: 60 + Math.floor(n / 4) * 220 };
}
