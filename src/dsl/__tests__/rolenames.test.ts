import { describe, expect, it } from 'vitest';
import { parseRolenamesBlock, cleanDbml } from '../dbmlClean';
import { parseDbml } from '../parse';

describe('parseRolenamesBlock', () => {
  it('parseia entradas child < parent', () => {
    const block = `Rolenames {
  pedidos.cliente_id < clientes.id
}`;
    expect(parseRolenamesBlock(block)).toEqual([
      { child: { table: 'pedidos', column: 'cliente_id' }, parent: { table: 'clientes', column: 'id' } },
    ]);
  });
});

describe('cleanDbml / parseDbml — Rolenames', () => {
  it('remove o bloco Rolenames do DBML limpo (DDL ignora)', () => {
    const src = `Table clientes {
  id int [pk]
}
Rolenames {
  pedidos.cliente_id < clientes.id
}`;
    expect(cleanDbml(src)).not.toMatch(/Rolenames/i);
  });

  it('expõe rolenames no ParseResult', () => {
    const src = `Table clientes {
  id int [pk]
}
Rolenames {
  pedidos.cliente_id < clientes.id
}`;
    expect(parseDbml(src).rolenames).toHaveLength(1);
  });
});
