import { describe, expect, it } from 'vitest';
import { pickLineageHandles, isLineageHandle } from '../lineageHandles';

describe('pickLineageHandles', () => {
  it('usa saída à esquerda quando o alvo está à esquerda', () => {
    const h = pickLineageHandles({ x: 400, y: 0 }, { x: 100, y: 0 });
    expect(h.sourceHandle).toBe('lin-l-s');
    expect(h.targetHandle).toBe('lin-r-t');
  });

  it('usa saída à direita quando o alvo está à direita', () => {
    const h = pickLineageHandles({ x: 100, y: 0 }, { x: 400, y: 0 });
    expect(h.sourceHandle).toBe('lin-r-s');
    expect(h.targetHandle).toBe('lin-l-t');
  });

  it('usa topo/baixo quando o deslocamento vertical domina', () => {
    const down = pickLineageHandles({ x: 0, y: 0 }, { x: 0, y: 200 });
    expect(down.sourceHandle).toBe('lin-b-s');
    expect(down.targetHandle).toBe('lin-t-t');

    const up = pickLineageHandles({ x: 0, y: 200 }, { x: 0, y: 0 });
    expect(up.sourceHandle).toBe('lin-t-s');
    expect(up.targetHandle).toBe('lin-b-t');
  });
});

describe('isLineageHandle', () => {
  it('reconhece portas L1 e rejeita colunas / field lineage', () => {
    expect(isLineageHandle('lin-l-s')).toBe(true);
    expect(isLineageHandle('lin-r-t')).toBe(true);
    expect(isLineageHandle('lin-l-1-s')).toBe(false);
    expect(isLineageHandle('s:col')).toBe(false);
    expect(isLineageHandle('fl:s:col')).toBe(false);
  });
});
