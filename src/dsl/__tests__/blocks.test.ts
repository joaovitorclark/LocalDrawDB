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
