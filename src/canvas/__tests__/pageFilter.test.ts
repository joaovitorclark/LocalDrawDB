import { describe, expect, it } from 'vitest';
import { parseDbml } from '../../dsl/parse';
import {
  aggregateCrossLinks,
  allTablesPage,
  buildCanvasViewModel,
  filterParseResultByPage,
  filterParseResultByPages,
  layoutExternalStubsOnTop,
  pagesFromTableGroups,
  type ExternalGroupStub,
} from '../pageFilter';
import { ALL_PAGE_ID, UNGROUPED_PAGE_ID } from '../scaleLimits';

describe('filterParseResultByPage', () => {
  const model = parseDbml(`
TableGroup vendas {
  loja.pedido
}

Table loja.cliente {
  id bigint [pk]
}

Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
}

Table crm.lead {
  id bigint [pk]
}

Ref: loja.pedido.cliente_id > loja.cliente.id
`);

  it('mantém modelo inteiro na página Todas', () => {
    const out = filterParseResultByPage(model, allTablesPage());
    expect(out.tables).toHaveLength(model.tables.length);
    expect(out.refs).toHaveLength(model.refs.length);
  });

  it('filtra tabelas e refs por TableGroup', () => {
    const page = { id: 'vendas', name: 'vendas', tableGroups: ['vendas'] };
    const out = filterParseResultByPage(model, page);
    expect(out.tables.map((t) => t.id)).toEqual(['loja.pedido']);
    expect(out.refs).toHaveLength(0);
  });

  it('mantém refs quando origem e destino estão na página', () => {
    const page = { id: 'vendas', name: 'vendas', tableGroups: ['vendas'] };
    const withBoth = parseDbml(`
TableGroup vendas {
  loja.pedido
  loja.cliente
}
Table loja.cliente {
  id bigint [pk]
}
Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
}
Ref: loja.pedido.cliente_id > loja.cliente.id
`);
    const out = filterParseResultByPage(withBoth, page);
    expect(out.tables.map((t) => t.id).sort()).toEqual(['loja.cliente', 'loja.pedido']);
    expect(out.refs).toHaveLength(1);
  });

  it('omite refs cuja origem ou destino está fora da página', () => {
    const page = { id: 'vendas', name: 'vendas', tableGroups: ['vendas'] };
    const cross = parseDbml(`
TableGroup vendas {
  loja.pedido
}
Table loja.cliente {
  id bigint [pk]
}
Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
}
Ref: loja.pedido.cliente_id > loja.cliente.id
`);
    const out = filterParseResultByPage(cross, page);
    expect(out.tables.map((t) => t.id)).toEqual(['loja.pedido']);
    expect(out.refs).toHaveLength(0);
  });

  it('inclui tabelas sem grupo na página virtual', () => {
    const page = { id: UNGROUPED_PAGE_ID, name: 'Sem grupo', tableGroups: [UNGROUPED_PAGE_ID] };
    const out = filterParseResultByPage(model, page);
    expect(out.tables.map((t) => t.id)).toEqual(['loja.cliente', 'crm.lead']);
  });

  it('une tabelas de várias páginas selecionadas', () => {
    const vendasPage = { id: 'vendas', name: 'vendas', tableGroups: ['vendas'] };
    const ungroupedPage = { id: UNGROUPED_PAGE_ID, name: 'Sem grupo', tableGroups: [UNGROUPED_PAGE_ID] };
    const allPages = [allTablesPage(), vendasPage, ungroupedPage];
    const out = filterParseResultByPages(model, allPages, ['vendas', UNGROUPED_PAGE_ID]);
    expect(out.tables.map((t) => t.id).sort()).toEqual(['crm.lead', 'loja.cliente', 'loja.pedido']);
  });
});

describe('pagesFromTableGroups', () => {
  it('deriva páginas dos TableGroups', () => {
    const model = parseDbml(`
TableGroup a {
  x.t1
}
TableGroup b {
  x.t2
}
Table x.t1 {
  id bigint [pk]
}
Table x.t2 {
  id bigint [pk]
}
Table x.orphan {
  id bigint [pk]
}
`);
    const pages = pagesFromTableGroups(model);
    expect(pages.map((p) => p.id).sort()).toEqual([UNGROUPED_PAGE_ID, 'a', 'b'].sort());
    expect(pages.find((p) => p.id === UNGROUPED_PAGE_ID)?.tableGroups).toEqual([UNGROUPED_PAGE_ID]);
  });
});

describe('buildCanvasViewModel', () => {
  it('cria stub e aresta externa quando FK cruza página', () => {
    const model = parseDbml(`
TableGroup fato {
  dw.fato_venda
}
TableGroup dimensoes_lookups {
  dw.dim_cliente
}
Table dw.fato_venda {
  id bigint [pk]
  cliente_id bigint
}
Table dw.dim_cliente {
  id bigint [pk]
}
Ref: dw.fato_venda.cliente_id > dw.dim_cliente.id
`);
    const pages = [allTablesPage(), ...pagesFromTableGroups(model)];
    const view = buildCanvasViewModel(model, pages, ['fato']);
    expect(view.model.tables.map((t) => t.id)).toEqual(['dw.fato_venda']);
    expect(view.stubs).toHaveLength(1);
    expect(view.stubs[0].label).toBe('dimensoes_lookups');
    expect(view.crossRefs).toHaveLength(1);
    expect(view.crossRefs[0].direction).toBe('out');
    expect(view.crossRefs[0].remoteLabel).toBe('dw.dim_cliente.id');
    expect(view.crossRefs[0].stubId).toBe(view.stubs[0].id);
  });

  it('agrega várias FKs da mesma tabela para um stub', () => {
    const model = parseDbml(`
TableGroup fato {
  dw.fato
}
TableGroup dims {
  dw.dim_a
  dw.dim_b
}
Table dw.fato {
  id bigint [pk]
  a bigint
  b bigint
}
Table dw.dim_a {
  id bigint [pk]
}
Table dw.dim_b {
  id bigint [pk]
}
Ref: dw.fato.a > dw.dim_a.id
Ref: dw.fato.b > dw.dim_b.id
`);
    const pages = [allTablesPage(), ...pagesFromTableGroups(model)];
    const view = buildCanvasViewModel(model, pages, ['fato']);
    const links = aggregateCrossLinks(view.crossRefs, view.stubs);
    expect(view.crossRefs).toHaveLength(2);
    expect(links).toHaveLength(1);
    expect(links[0].count).toBe(2);
    expect(links[0].stubLabel).toBe('dims');
  });

  it('layoutExternalStubsOnTop coloca stubs acima do conteúdo', () => {
    const stubs: ExternalGroupStub[] = [
      { id: 'external:a', groupKey: 'a', label: 'alpha', tableCount: 1 },
      { id: 'external:b', groupKey: 'b', label: 'beta', tableCount: 2 },
    ];
    const tablePos = {
      't1': { x: 100, y: 200 },
      't2': { x: 400, y: 220 },
    };
    const out = layoutExternalStubsOnTop(tablePos, stubs);
    expect(out['t1'].y).toBeGreaterThan(out['external:a'].y);
    expect(out['external:a'].y).toBe(out['external:b'].y);
    expect(out['external:a'].x).toBeLessThan(out['external:b'].x);
  });
});

describe('allTablesPage', () => {
  it('usa id reservado', () => {
    expect(allTablesPage().id).toBe(ALL_PAGE_ID);
  });
});
