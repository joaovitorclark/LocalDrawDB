// F4 — metadados dbt do bloco Dbt { } chegam às TableView/ColumnView do front.
import { describe, expect, it } from 'vitest';
import { parseDbml } from '../parse';

const DBML = `Table gold.fatos {
  id bigint [pk]
  status string
  categoria string
}

Dbt {
  table gold.fatos {
    resource_type: model
    materialization: incremental
    tags: ['core', 'gold']
    columns {
      status {
        accepted_values: ['A', 'B']
      }
    }
  }
}
`;

describe('parseDbml — metadados dbt', () => {
  const r = parseDbml(DBML);
  const t = r.tables.find((x) => x.id === 'gold.fatos')!;

  it('anexa resourceType/materialization/tags à tabela', () => {
    expect(t.resourceType).toBe('model');
    expect(t.materialization).toBe('incremental');
    expect(t.tags).toEqual(['core', 'gold']);
  });

  it('anexa accepted_values à coluna', () => {
    const status = t.columns.find((c) => c.name === 'status')!;
    expect(status.acceptedValues).toEqual(['A', 'B']);
  });

  it('coluna sem teste não ganha acceptedValues', () => {
    const categoria = t.columns.find((c) => c.name === 'categoria')!;
    expect(categoria.acceptedValues).toBeUndefined();
  });

  it('DBML sem bloco Dbt não popula campos dbt', () => {
    const plain = parseDbml('Table t {\n  id bigint [pk]\n}\n');
    expect(plain.tables[0].resourceType).toBeUndefined();
    expect(plain.tables[0].materialization).toBeUndefined();
  });
});
