import { describe, expect, it } from 'vitest';
import { dbmlToModel } from '../dbmlIo.ts';
import { sparkDDLBySchema } from '../ddl/spark.ts';

const LAKEHOUSE_DBML = `LayerGroup bronze {
  raw.orders
}

TableGroup ingestao {
  raw.orders
}

Table raw.orders {
  id bigint [pk]
  customer_id bigint
}

Table raw.customers {
  id bigint [pk]
}

Ref: raw.orders.customer_id > raw.customers.id

Lineage {
  silver.orders < raw.orders
}

LineageFields {
  silver.orders.id < raw.orders.id
}

Records raw.orders (id, customer_id) {
  Note: 'Pedidos brutos'
  1, 100
}
`;

describe('export DDL com blocos custom', () => {
  it('dbmlToModel aceita LayerGroup + Lineage + Records', () => {
    const model = dbmlToModel(LAKEHOUSE_DBML);
    expect(model.tables.map((t) => t.name).sort()).toEqual(['customers', 'orders']);
    expect(model.refs).toHaveLength(1);
    const orders = model.tables.find((t) => t.name === 'orders')!;
    expect(orders.layer).toBe('bronze');
    expect(orders.group).toBe('ingestao');
    expect(orders.records?.rows).toHaveLength(1);
    expect(orders.note).toBe('Pedidos brutos');
  });

  it('gera DDL Spark sem erro de parse', () => {
    const model = dbmlToModel(LAKEHOUSE_DBML);
    const files = sparkDDLBySchema(model);
    expect(Object.keys(files).length).toBeGreaterThan(0);
    const all = Object.values(files).join('\n');
    expect(all).toContain('CREATE TABLE IF NOT EXISTS raw.orders');
    expect(all).toContain('USING DELTA');
  });
});
