import { describe, expect, it } from 'vitest';
import { pinnedCreatedMessage } from '../projectMessages';

describe('pinnedCreatedMessage', () => {
  it('inclui o nome e a instrução de reiniciar', () => {
    const msg = pinnedCreatedMessage('Vendas');
    expect(msg).toContain('Vendas');
    expect(msg).toContain('./ldb');
  });
});
