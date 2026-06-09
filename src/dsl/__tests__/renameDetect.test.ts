import { describe, expect, it } from 'vitest';
import { detectRenames } from '../renameDetect';
import { renameColumnAllRefs, renameTable } from '../edit';

describe('detectRenames', () => {
  it('detecta renomeação de tabela com colunas similares', () => {
    const prev = `
Table bronze.foo {
  id bigint [pk]
  nome string
}
Ref: silver.x.id > bronze.foo.id
`;
    const next = prev.replace('bronze.foo', 'bronze.bar');
    const detected = detectRenames(prev, next);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toEqual({ kind: 'table', oldId: 'bronze.foo', newId: 'bronze.bar' });
  });

  it('detecta renomeação de coluna na mesma posição', () => {
    const prev = `
Table silver.pedido {
  num_pedido bigint [pk]
  total decimal
}
Ref: silver.pedido.num_pedido > bronze.origem.id
`;
    const next = prev.replace('num_pedido', 'cod_pedido');
    const detected = detectRenames(prev, next);
    expect(detected.some((d) => d.kind === 'column' && d.oldCol === 'num_pedido')).toBe(true);
  });
});

describe('renameColumnAllRefs', () => {
  it('propaga coluna em Ref e LineageFields', () => {
    const src = `
Table bronze.a {
  old_col bigint [pk]
}
Table silver.b {
  x bigint [pk]
}
Ref: silver.b.x > bronze.a.old_col
LineageFields {
  silver.b.x < bronze.a.old_col
}
`;
    const out = renameColumnAllRefs(src, 'bronze.a', 'old_col', 'new_col');
    expect(out).toContain('new_col bigint');
    expect(out).toContain('bronze.a.new_col');
    expect(out).not.toContain('old_col');
  });
});

describe('renameTable', () => {
  it('propaga em Ref e TableGroup', () => {
    const src = `
TableGroup g {
  loja.a
}
Table loja.a {
  id bigint [pk]
}
Ref: loja.b.id > loja.a.id
`;
    const out = renameTable(src, 'loja.a', 'loja.cliente');
    expect(out).toContain('Table loja.cliente');
    expect(out).toContain('loja.cliente.id');
    expect(out).toContain('loja.cliente');
  });
});
