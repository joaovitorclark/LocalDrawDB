import { describe, expect, it } from 'vitest';
import type { TableView } from '../../dsl/parse';
import { nodeHeight } from '../nodeMetrics';
import { COLUMN_VIRTUAL_VIEW_ROWS, COLUMN_VIRTUAL_ROW_H } from '../scaleLimits';

function tableWithCols(n: number): TableView {
  return {
    id: 'raw.big',
    name: 'big',
    schema: 'raw',
    columns: Array.from({ length: n }, (_, i) => ({
      name: `col_${i}`,
      type: 'string',
      pk: false,
      notNull: false,
    })),
  };
}

describe('nodeHeight', () => {
  it('limita altura quando colunas passam do limiar de virtualização', () => {
    const small = nodeHeight(tableWithCols(10));
    const capped = nodeHeight(tableWithCols(200));
    const full = 34 + 200 * COLUMN_VIRTUAL_ROW_H + 26;
    const virtual = 34 + COLUMN_VIRTUAL_VIEW_ROWS * COLUMN_VIRTUAL_ROW_H + 26;
    expect(small).toBeLessThan(capped);
    expect(capped).toBe(virtual);
    expect(capped).toBeLessThan(full);
  });
});
