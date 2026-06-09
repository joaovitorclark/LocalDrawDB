import { describe, expect, it } from 'vitest';
import { defaultTablePosition } from '../defaultTablePosition';

describe('defaultTablePosition', () => {
  it('gera posições distintas para tabelas novas', () => {
    const p1 = defaultTablePosition({});
    const p2 = defaultTablePosition({ t1: p1 });
    expect(p1).not.toEqual(p2);
  });
});
