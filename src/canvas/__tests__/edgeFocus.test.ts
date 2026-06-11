import { describe, expect, it } from 'vitest';
import type { Edge } from 'reactflow';
import { edgeFocusTier } from '../edgeFocus';

const col = { table: 'silver.fact_orders', column: 'customer_id' };

describe('edgeFocusTier', () => {
  it('destaca FK da coluna selecionada', () => {
    const fk: Edge = {
      id: 'r1',
      source: 'silver.fact_orders',
      target: 'silver.dim_customer',
      sourceHandle: 's:customer_id',
      targetHandle: 't:customer_key',
      type: 'relation',
    };
    expect(edgeFocusTier(fk, col)).toBe('primary');
  });

  it('atenua outras FKs da mesma tabela', () => {
    const otherFk: Edge = {
      id: 'r2',
      source: 'silver.fact_orders',
      target: 'raw.erp_orders',
      sourceHandle: 's:order_id',
      targetHandle: 't:order_id',
      type: 'relation',
    };
    expect(edgeFocusTier(otherFk, col)).toBe('secondary');
  });

  it('esmaece arestas de outras tabelas', () => {
    const foreign: Edge = {
      id: 'r3',
      source: 'gold.report',
      target: 'silver.dim_product',
      sourceHandle: 's:sku',
      targetHandle: 't:sku',
      type: 'relation',
    };
    expect(edgeFocusTier(foreign, col)).toBe('dimmed');
  });

  it('destaca L2 da coluna selecionada', () => {
    const l2: Edge = {
      id: 'fl1',
      source: 'raw.erp_orders',
      target: 'silver.fact_orders',
      sourceHandle: 'fl:s:account_external_id',
      targetHandle: 'fl:t:customer_id',
      type: 'fieldLineage',
    };
    expect(edgeFocusTier(l2, col)).toBe('primary');
  });

  it('atenua outras L2 da mesma tabela', () => {
    const l2other: Edge = {
      id: 'fl2',
      source: 'raw.erp_order_lines',
      target: 'silver.fact_orders',
      sourceHandle: 'fl:s:line_id',
      targetHandle: 'fl:t:line_id',
      type: 'fieldLineage',
    };
    expect(edgeFocusTier(l2other, col)).toBe('secondary');
  });
});
