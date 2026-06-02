import { describe, expect, it } from 'vitest';
import { appendRef, refExists, removeRef, setColumnSetting, getColumnSettings, renameColumn, addColumn, renameTable } from '../edit';
import { parseDbml } from '../parse';

const SRC = `Table loja.cliente {
  id bigint [pk]
  nome string
}

Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
}
`;

const reparses = (src: string) => !parseDbml(src).error;

describe('appendRef', () => {
  it('cria Ref e fica re-parseável', () => {
    const out = appendRef(SRC, 'loja.pedido', 'cliente_id', 'loja.cliente', 'id');
    expect(out).toContain('Ref: loja.pedido.cliente_id > loja.cliente.id');
    expect(reparses(out)).toBe(true);
    expect(parseDbml(out).refs).toHaveLength(1);
  });

  it('não duplica', () => {
    const once = appendRef(SRC, 'loja.pedido', 'cliente_id', 'loja.cliente', 'id');
    const twice = appendRef(once, 'loja.pedido', 'cliente_id', 'loja.cliente', 'id');
    expect(twice).toBe(once);
    expect(refExists(once, 'loja.pedido', 'cliente_id', 'loja.cliente', 'id')).toBe(true);
  });

  it('ignora self-loop na mesma coluna', () => {
    expect(appendRef(SRC, 'loja.cliente', 'id', 'loja.cliente', 'id')).toBe(SRC);
  });
});

describe('removeRef', () => {
  const TWO_REFS = `Table a {
  id bigint [pk]
  b_id bigint
  c_id bigint
}
Table b {
  id bigint [pk]
}
Table c {
  id bigint [pk]
}
Ref: a.b_id > b.id
Ref: a.c_id > c.id
`;

  it('remove só o ref alvo e mantém o outro', () => {
    const out = removeRef(TWO_REFS, 'a', 'b_id', 'b', 'id');
    expect(out).not.toContain('a.b_id > b.id');
    expect(out).toContain('a.c_id > c.id');
    expect(reparses(out)).toBe(true);
    expect(parseDbml(out).refs).toHaveLength(1);
  });

  it('round-trip appendRef -> removeRef volta ao original (sem o ref)', () => {
    const base = `Table a {\n  id bigint [pk]\n  b_id bigint\n}\nTable b {\n  id bigint [pk]\n}\n`;
    const added = appendRef(base, 'a', 'b_id', 'b', 'id');
    expect(parseDbml(added).refs).toHaveLength(1);
    const removedBack = removeRef(added, 'a', 'b_id', 'b', 'id');
    expect(parseDbml(removedBack).refs).toHaveLength(0);
  });
});

describe('setColumnSetting / getColumnSettings', () => {
  it('adiciona not null preservando pk', () => {
    const out = setColumnSetting(SRC, 'loja.cliente', 'id', { pk: true, notNull: true });
    expect(out).toMatch(/id bigint \[pk, not null\]/);
    expect(reparses(out)).toBe(true);
    const s = getColumnSettings(out, 'loja.cliente', 'id');
    expect(s.pk).toBe(true);
    expect(s.notNull).toBe(true);
  });

  it('adiciona note e default em coluna sem settings', () => {
    const out = setColumnSetting(SRC, 'loja.cliente', 'nome', { note: 'apelido', default: "'x'" });
    expect(out).toMatch(/nome string \[note: 'apelido', default: 'x'\]/);
    expect(reparses(out)).toBe(true);
  });

  it('remove settings ao desmarcar (bracket vazio some)', () => {
    const withPk = SRC;
    const out = setColumnSetting(withPk, 'loja.cliente', 'id', { pk: false });
    expect(out).toMatch(/id bigint$/m);
    expect(reparses(out)).toBe(true);
  });
});

describe('renameColumn / addColumn', () => {
  it('renomeia só na tabela alvo e re-parseia', () => {
    const out = renameColumn(SRC, 'loja.cliente', 'nome', 'nome_completo');
    expect(out).toMatch(/nome_completo string/);
    expect(out).toMatch(/cliente_id bigint/); // outra tabela intacta
    expect(reparses(out)).toBe(true);
  });

  it('adiciona coluna antes do fechamento', () => {
    const out = addColumn(SRC, 'loja.pedido', 'total', 'decimal(18,2)');
    expect(out).toMatch(/total decimal\(18,2\)/);
    expect(reparses(out)).toBe(true);
    const t = parseDbml(out).tables.find((t) => t.name === 'pedido')!;
    expect(t.columns.map((c) => c.name)).toContain('total');
  });
});

describe('renameTable', () => {
  const WITH_REF = `Table loja.cliente {
  id bigint [pk]
}
Table loja.cliente_endereco {
  cliente_id bigint
}
Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
}
Ref: loja.pedido.cliente_id > loja.cliente.id

TableGroup vendas {
  loja.cliente
  loja.pedido
}
`;

  it('renomeia cabeçalho, ref e membro de grupo', () => {
    const out = renameTable(WITH_REF, 'loja.cliente', 'loja.consumidor');
    expect(out).toContain('Table loja.consumidor {');
    expect(out).toContain('Ref: loja.pedido.cliente_id > loja.consumidor.id');
    expect(out).toMatch(/TableGroup vendas \{[^}]*loja\.consumidor/);
    expect(reparses(out)).toBe(true);
  });

  it('não afeta tabela com nome que tem o antigo como prefixo', () => {
    const out = renameTable(WITH_REF, 'loja.cliente', 'loja.consumidor');
    expect(out).toContain('Table loja.cliente_endereco {'); // intacta
  });
});
