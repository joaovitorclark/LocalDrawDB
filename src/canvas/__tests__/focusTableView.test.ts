import { describe, expect, it } from 'vitest';
import type { Node } from 'reactflow';
import { diagramOverviewBounds, fieldMappingFocusBounds, tableFocusBounds } from '../focusTableView';

function node(id: string, x: number, y: number, w: number, h: number): Node {
  return {
    id,
    type: 'table',
    position: { x, y },
    width: w,
    height: h,
    data: {},
  };
}

describe('focusTableView', () => {
  it('limita altura ao focar tabela alta', () => {
    const bounds = tableFocusBounds(node('t', 10, 20, 240, 6000));
    expect(bounds).toEqual({ x: 10, y: 20, width: 240, height: 420 });
  });

  it('overview ignora cauda longa de colunas', () => {
    const bounds = diagramOverviewBounds([
      node('a', 0, 0, 200, 5000),
      node('b', 300, 0, 200, 180),
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 500, height: 420 });
  });

  it('bounds de mapeamento L2 unem origem e destino', () => {
    const getNode = (id: string) => (id === 'src' ? node('src', 0, 0, 220, 200) : node('tgt', 400, 50, 220, 180));
    expect(fieldMappingFocusBounds(getNode, 'src', 'tgt')).toEqual({
      x: 0,
      y: 0,
      width: 620,
      height: 230,
    });
  });
});
