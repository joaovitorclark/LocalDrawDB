import { describe, expect, it } from 'vitest';
import { splitDbmlBlocks } from '../blocks';
import { organize } from '../organize';
import { parseRecords } from '../records';
import { extractRecords } from '../parse';

// Exemplo canônico do dbdiagram (com Records, que o @dbml/core não suporta).
const DBDIAGRAM = `// Use DBML to define your database structure
// Docs: https://dbml.dbdiagram.io/docs

Table follows {
  following_user_id integer
  followed_user_id integer
  created_at timestamp
}

Table users {
  id integer [primary key]
  username varchar
  role varchar
  created_at timestamp
}

Ref user_posts: posts.user_id > users.id // many-to-one

Ref: users.id < follows.following_user_id

Records users(id, username, role) {
  0, 'Alice', 'admin'
  1, 'Bob, the builder', 'moderator'
}

Table posts {
  id integer [primary key]
  title varchar
  user_id integer [not null]
}
`;

describe('splitDbmlBlocks', () => {
  const blocks = splitDbmlBlocks(DBDIAGRAM);

  it('separa tables, refs e records', () => {
    expect(blocks.filter((b) => b.type === 'table').map((b) => b.name)).toEqual([
      'follows',
      'users',
      'posts',
    ]);
    expect(blocks.filter((b) => b.type === 'ref')).toHaveLength(2);
    expect(blocks.filter((b) => b.type === 'records')).toHaveLength(1);
  });

  it('mantém chaves balanceadas mesmo com } dentro de string', () => {
    const t = splitDbmlBlocks("Table x {\n  a string [note: 'has } brace']\n}\nRef: x.a > y.b");
    expect(t.filter((b) => b.type === 'table')).toHaveLength(1);
    expect(t.filter((b) => b.type === 'ref')).toHaveLength(1);
  });

  it('anexa comentário acima ao bloco seguinte', () => {
    const first = blocks[0];
    expect(first.type).toBe('table');
    expect(first.text).toContain('// Use DBML');
  });
});

describe('organize', () => {
  it('reordena para tables -> refs -> records e é idempotente', () => {
    const once = organize(DBDIAGRAM);
    const tableIdx = once.indexOf('Table');
    const refIdx = once.indexOf('Ref ');
    const recIdx = once.indexOf('Records');
    expect(tableIdx).toBeGreaterThanOrEqual(0);
    expect(tableIdx).toBeLessThan(refIdx);
    expect(refIdx).toBeLessThan(recIdx);
    expect(organize(once)).toBe(once);
  });
});

describe('extractRecords + parseRecords', () => {
  it('remove records do texto e preserva a amostra', () => {
    const { clean, records } = extractRecords(DBDIAGRAM);
    expect(clean).not.toContain('Records');
    expect(records).toHaveLength(1);
    expect(records[0].table).toBe('users');
    expect(records[0].columns).toEqual(['id', 'username', 'role']);
    expect(records[0].rows).toHaveLength(2);
    // vírgula dentro de aspas não quebra a coluna
    expect(records[0].rows[1][1]).toBe('Bob, the builder');
  });

  it('parseRecords sem colunas explícitas', () => {
    const pr = parseRecords('Records t {\n  1, 2\n  3, 4\n}');
    expect(pr?.columns).toEqual([]);
    expect(pr?.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

// ---- LayerGroup ----

import { parseLayerGroup, parseDbml } from '../parse';
import { layersFromGroups, tableLayerMap } from '../../layers';
import { setTableLayer, addLayerGroup } from '../edit';

const DBML_WITH_LAYERS = `Table raw.orders {
  id bigint [pk]
}

Table raw.customers {
  id bigint [pk]
}

Table silver.dim_customer {
  id bigint [pk]
}

LayerGroup bronze [color: #b08d57] {
  raw.orders
  raw.customers
}

LayerGroup prata [color: #aaa] {
  silver.dim_customer
}
`;

describe('splitDbmlBlocks reconhece layerGroup', () => {
  it('detecta blocos layerGroup', () => {
    const blocks = splitDbmlBlocks(DBML_WITH_LAYERS);
    const lgs = blocks.filter((b) => b.type === 'layerGroup');
    expect(lgs).toHaveLength(2);
  });
});

describe('parseLayerGroup', () => {
  it('extrai nome, cor e tabelas', () => {
    const lg = parseLayerGroup('LayerGroup bronze [color: #b08d57] {\n  raw.orders\n  raw.customers\n}');
    expect(lg).not.toBeNull();
    expect(lg!.id).toBe('bronze');
    expect(lg!.name).toBe('bronze');
    expect(lg!.color).toBe('#b08d57');
    expect(lg!.tables).toEqual(['raw.orders', 'raw.customers']);
  });

  it('funciona sem cor', () => {
    const lg = parseLayerGroup('LayerGroup staging {\n  stg.events\n}');
    expect(lg).not.toBeNull();
    expect(lg!.id).toBe('staging');
    expect(lg!.color).toBeUndefined();
    expect(lg!.tables).toEqual(['stg.events']);
  });
});

describe('parse extrai layerGroups sem quebrar', () => {
  it('parseDbml retorna layerGroups e tabelas corretamente', () => {
    const result = parseDbml(DBML_WITH_LAYERS);
    expect(result.error).toBeUndefined();
    expect(result.tables).toHaveLength(3);
    expect(result.layerGroups).toHaveLength(2);
    expect(result.layerGroups[0].id).toBe('bronze');
    expect(result.layerGroups[0].tables).toEqual(['raw.orders', 'raw.customers']);
    expect(result.layerGroups[1].id).toBe('prata');
  });
});

describe('tableLayerMap + auto-schema', () => {
  it('monta mapa tabela→camada', () => {
    const result = parseDbml(DBML_WITH_LAYERS);
    const map = tableLayerMap(result.layerGroups);
    expect(map['raw.orders']).toBe('bronze');
    expect(map['raw.customers']).toBe('bronze');
    expect(map['silver.dim_customer']).toBe('prata');
  });
});

describe('layersFromGroups', () => {
  it('sobrepõe cor de built-in e adiciona camadas novas', () => {
    const groups = [
      { id: 'bronze', name: 'bronze', color: '#custom', tables: [] },
      { id: 'custom_layer', name: 'Custom', color: '#ff0000', tables: [] },
    ];
    const layers = layersFromGroups(groups);
    expect(layers.find((l) => l.id === 'bronze')!.color).toBe('#custom');
    expect(layers.find((l) => l.id === 'prata')!.color).toBe('#9ca3af'); // built-in intacto
    expect(layers.find((l) => l.id === 'custom_layer')).toBeTruthy();
  });
});

describe('edit.setTableLayer', () => {
  it('adiciona tabela a camada existente', () => {
    const src = `Table x {\n  id bigint [pk]\n}\n\nLayerGroup bronze [color: #b08d57] {\n  raw.orders\n}\n`;
    const out = setTableLayer(src, 'x', 'bronze');
    expect(out).toContain('x');
    expect(out).toContain('raw.orders');
    expect(parseDbml(out).error).toBeUndefined();
  });

  it('remove tabela da camada (layerId=null)', () => {
    const src = `Table raw.orders {\n  id bigint [pk]\n}\n\nLayerGroup bronze [color: #b08d57] {\n  raw.orders\n}\n`;
    const out = setTableLayer(src, 'raw.orders', null);
    const lg = parseDbml(out).layerGroups.find((g) => g.id === 'bronze');
    expect(lg?.tables).not.toContain('raw.orders');
  });

  it('cria bloco LayerGroup se não existir', () => {
    const src = `Table x {\n  id bigint [pk]\n}\n`;
    const out = setTableLayer(src, 'x', 'ouro', '#d4af37');
    expect(out).toContain('LayerGroup ouro');
    expect(out).toContain('x');
    expect(parseDbml(out).error).toBeUndefined();
  });
});

describe('organize preserva LayerGroup', () => {
  it('LayerGroup aparece após tableGroup e antes de records', () => {
    const src = `Records t(a) {\n  1\n}\n\nLayerGroup bronze {\n  raw.x\n}\n\nTable raw.x {\n  a int\n}\n`;
    const out = organize(src);
    const lgIdx = out.indexOf('LayerGroup');
    const recIdx = out.indexOf('Records');
    const tblIdx = out.indexOf('Table');
    expect(tblIdx).toBeLessThan(lgIdx);
    expect(lgIdx).toBeLessThan(recIdx);
  });
});

describe('splitDbmlBlocks — Rolenames', () => {
  it('reconhece bloco Rolenames como tipo próprio', () => {
    const src = `Rolenames {
  pedidos.cliente_id < clientes.id
}
`;
    const blocks = splitDbmlBlocks(src);
    expect(blocks.some((b) => b.type === 'rolenames')).toBe(true);
  });
});
