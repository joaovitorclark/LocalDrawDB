import { describe, expect, it } from 'vitest';
import { dbmlToModel } from '../dbmlIo.ts';
import { modelToPostgresDDL } from '../ddl/postgres.ts';

const LOJA_DBML = `Table loja.pedido {
  id bigint [pk]
  customer_id bigint
  valor decimal(18,2)
  ativo boolean
}
Table loja.cliente {
  id bigint [pk]
  nome string
}
Ref: loja.pedido.customer_id > loja.cliente.id
`;

describe('PostgreSQL DDL limpo', () => {
  it('mapeia tipos Postgres e PRIMARY KEY', () => {
    const ddl = modelToPostgresDDL(dbmlToModel(LOJA_DBML));
    expect(ddl).toContain('-- LocalDrawDB: DDL PostgreSQL');
    expect(ddl).toContain('CREATE TABLE loja.pedido');
    expect(ddl).toContain('BIGINT');
    expect(ddl).toContain('NUMERIC(18,2)');
    expect(ddl).toContain('BOOLEAN');
    expect(ddl).toContain('TEXT');
    expect(ddl).toContain('PRIMARY KEY (id)');
    expect(ddl).not.toContain('@map');
  });

  it('emite ALTER TABLE para FKs', () => {
    const ddl = modelToPostgresDDL(dbmlToModel(LOJA_DBML));
    expect(ddl).toContain('ALTER TABLE loja.pedido ADD CONSTRAINT');
    expect(ddl).toContain('FOREIGN KEY (customer_id) REFERENCES loja.cliente (id)');
  });
});
