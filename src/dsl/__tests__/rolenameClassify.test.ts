import { describe, expect, it } from 'vitest';
import { classifyChildFks } from '../rolename';

describe('classifyChildFks', () => {
  const base = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int [pk]
  id_cliente int
}
Ref: pedidos.id_cliente > clientes.id
`;

  it('classifica FK herdada quando o nome bate', () => {
    const src = `Table clientes {
  id int [pk]
}
Table pedidos {
  id int
}
Ref: pedidos.id > clientes.id
`;
    const out = classifyChildFks(src, 'clientes', 'id');
    expect(out.find((d) => d.child.table === 'pedidos')?.kind).toBe('inherited');
  });

  it('classifica como divergente quando o nome difere sem rolename', () => {
    const out = classifyChildFks(base, 'clientes', 'id');
    expect(out.find((d) => d.child.column === 'id_cliente')?.kind).toBe('divergent');
  });

  it('classifica como rolename quando listado no bloco', () => {
    const src = base + `Rolenames {
  pedidos.id_cliente < clientes.id
}
`;
    const out = classifyChildFks(src, 'clientes', 'id');
    expect(out.find((d) => d.child.column === 'id_cliente')?.kind).toBe('rolename');
  });
});
