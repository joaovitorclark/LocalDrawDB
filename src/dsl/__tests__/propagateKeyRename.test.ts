import { describe, expect, it } from 'vitest';
import { propagateKeyRename } from '../propagateKeyRename';

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
