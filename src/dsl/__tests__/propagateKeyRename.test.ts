import { describe, expect, it } from 'vitest';
import { propagateKeyRename, keepSeparateKeyRename } from '../propagateKeyRename';

describe('propagateKeyRename', () => {
  it('renomeia a chave e a FK filha herdada', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int
}
Ref: pedidos.id > clientes.id
`;
    const out = propagateKeyRename(src, 'clientes', 'id', 'codigo');
    expect(out).toContain('codigo int [pk]');
    expect(out).toContain('pedidos.codigo'); // FK herdada acompanhou
    expect(out).toContain('clientes.codigo');
  });

  it('keepSeparate: mantém nome da filha herdada e grava rolename', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int
}
Ref: pedidos.id > clientes.id
`;
    const out = keepSeparateKeyRename(src, 'clientes', 'id', 'codigo');
    expect(out).toContain('codigo int [pk]');   // mãe renomeada
    expect(out).toContain('clientes.codigo');    // alvo do ref atualizado
    expect(out).toMatch(/pedidos\.id\b/);        // filha manteve o nome 'id'
    expect(out).toMatch(/Rolenames\s*\{[\s\S]*pedidos\.id\s*<\s*clientes\.codigo/); // rolename gravado
  });

  it('keepSeparate: grava rolename também para filha divergente', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id_cliente int
}
Ref: pedidos.id_cliente > clientes.id
`;
    const out = keepSeparateKeyRename(src, 'clientes', 'id', 'codigo');
    expect(out).toContain('id_cliente int');   // filha divergente mantém o nome
    expect(out).toContain('clientes.codigo');   // alvo do ref atualizado
    expect(out).toMatch(/Rolenames\s*\{[\s\S]*pedidos\.id_cliente\s*<\s*clientes\.codigo/);
  });

  it('mantém a FK rolename, atualizando só o alvo do ref', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id_cliente int
}
Ref: pedidos.id_cliente > clientes.id
Rolenames {
  pedidos.id_cliente < clientes.id
}
`;
    const out = propagateKeyRename(src, 'clientes', 'id', 'codigo');
    expect(out).toContain('id_cliente int'); // nome próprio preservado
    expect(out).toContain('clientes.codigo'); // alvo do ref atualizado
  });
});
