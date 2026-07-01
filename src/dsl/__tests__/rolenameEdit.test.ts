import { describe, expect, it } from 'vitest';
import { addRolename, removeRolename } from '../edit';

const child = { table: 'pedidos', column: 'cliente_id' };
const parent = { table: 'clientes', column: 'id' };

describe('addRolename', () => {
  it('cria o bloco e adiciona a entrada', () => {
    const out = addRolename('Table clientes {\n  id int [pk]\n}\n', child, parent);
    expect(out).toMatch(/Rolenames\s*\{/);
    expect(out).toContain('pedidos.cliente_id < clientes.id');
  });

  it('é idempotente', () => {
    const a = addRolename('', child, parent);
    const b = addRolename(a, child, parent);
    expect((b.match(/pedidos\.cliente_id/g) ?? []).length).toBe(1);
  });
});

describe('removeRolename', () => {
  it('remove a entrada (e o bloco se ficar vazio)', () => {
    const a = addRolename('', child, parent);
    const out = removeRolename(a, child);
    expect(out).not.toMatch(/pedidos\.cliente_id/);
  });
});
