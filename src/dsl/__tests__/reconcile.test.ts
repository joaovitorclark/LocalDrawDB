import { describe, expect, it } from 'vitest';
import { analyzeRenames, countRenameRefs } from '../reconcile';

describe('countRenameRefs', () => {
  it('conta referências de uma coluna fora da definição', () => {
    const src = `Table bronze.a {
  old_col bigint [pk]
}
Table silver.b {
  x bigint [pk]
}
Ref: silver.b.x > bronze.a.old_col
`;
    const n = countRenameRefs(src, { kind: 'column', table: 'bronze.a', oldCol: 'old_col', newCol: 'new_col' });
    expect(n).toBe(1);
  });

  it('conta referências de tabela em Ref e TableGroup', () => {
    const src = `TableGroup g {
  loja.a
}
Table loja.a {
  id bigint [pk]
}
Ref: loja.b.id > loja.a.id
`;
    const n = countRenameRefs(src, { kind: 'table', oldId: 'loja.a', newId: 'loja.cliente' });
    expect(n).toBe(2); // membro do grupo + alvo do Ref (não conta o cabeçalho Table)
  });
});

describe('analyzeRenames', () => {
  it('não detecta nada quando o texto é igual', () => {
    expect(analyzeRenames('Table a {\n id int\n}', 'Table a {\n id int\n}')).toEqual([]);
  });

  it('marca affectsRefs quando o rename toca referências', () => {
    const prev = `Table bronze.a {
  old_col bigint [pk]
}
Ref: silver.b.x > bronze.a.old_col
`;
    const next = prev.replace('old_col', 'new_col');
    const out = analyzeRenames(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0].affectsRefs).toBe(true);
    expect(out[0].refCount).toBeGreaterThanOrEqual(1);
  });
});
