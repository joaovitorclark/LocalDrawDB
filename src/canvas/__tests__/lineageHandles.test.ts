import { describe, expect, it } from 'vitest';
import { pickLineageHandles } from '../lineageHandles';

describe('pickLineageHandles', () => {
  it('usa saída à esquerda quando o alvo está à esquerda', () => {
    const h = pickLineageHandles({ x: 400, y: 0 }, { x: 100, y: 0 });
    expect(h.sourceHandle).toBe('lin-l-1-s');
    expect(h.targetHandle).toBe('lin-r-1-t');
  });

  it('usa saída à direita quando o alvo está à direita', () => {
    const h = pickLineageHandles({ x: 100, y: 0 }, { x: 400, y: 0 });
    expect(h.sourceHandle).toBe('lin-r-1-s');
    expect(h.targetHandle).toBe('lin-l-1-t');
  });

  it('usa topo/baixo quando o deslocamento vertical domina', () => {
    const down = pickLineageHandles({ x: 0, y: 0 }, { x: 0, y: 200 });
    expect(down.sourceHandle).toBe('lin-b-1-s');
    expect(down.targetHandle).toBe('lin-t-1-t');

    const up = pickLineageHandles({ x: 0, y: 200 }, { x: 0, y: 0 });
    expect(up.sourceHandle).toBe('lin-t-1-s');
    expect(up.targetHandle).toBe('lin-b-1-t');
  });
});
