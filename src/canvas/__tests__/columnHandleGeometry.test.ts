import { describe, expect, it } from 'vitest';
import type { TableNodeData } from '../actions';
import { COLUMN_VIRTUAL_ROW_H, COLUMN_VIRTUALIZE_THRESHOLD } from '../scaleLimits';
import {
  columnAnchorY,
  columnScrollViewport,
  COLUMN_SCROLL_VIEW_H,
  TABLE_FOOTER_H,
  TABLE_HEADER_H,
  tableBodyHeight,
} from '../columnHandleGeometry';

const PORT_INSET = 8;

function tableWithCols(n: number): TableNodeData {
  return {
    id: 'raw.big',
    name: 'big',
    columns: Array.from({ length: n }, (_, i) => ({
      name: `col_${i}`,
      type: 'string',
      pk: false,
      notNull: false,
    })),
    headerColor: '#13284b',
    meta: {
      sources: [],
      sample: null,
      pks: [],
      fks: [],
      refsIn: [],
      columnNotes: [],
      has: false,
    },
  };
}

describe('columnAnchorY', () => {
  it('alinha na linha visível quando a coluna está no viewport', () => {
    const data = tableWithCols(COLUMN_VIRTUALIZE_THRESHOLD + 10);
    const idx = 50;
    const anchor = columnAnchorY(data, `col_${idx}`, idx * COLUMN_VIRTUAL_ROW_H)!;
    expect(anchor.kind).toBe('row');
    expect(anchor.y).toBeCloseTo(TABLE_HEADER_H + COLUMN_VIRTUAL_ROW_H / 2, 5);
  });

  it('acumula na borda de baixo quando a coluna está abaixo do viewport', () => {
    const data = tableWithCols(COLUMN_VIRTUALIZE_THRESHOLD + 10);
    const { bottom } = columnScrollViewport(data);
    const anchor = columnAnchorY(data, 'col_55', 0)!;
    expect(anchor.kind).toBe('below');
    expect(anchor.y).toBeCloseTo(bottom - PORT_INSET, 5);
    expect(anchor.y).toBeLessThan(tableBodyHeight(data) - TABLE_FOOTER_H);
  });

  it('acumula na borda de cima quando a coluna está acima do viewport', () => {
    const data = tableWithCols(COLUMN_VIRTUALIZE_THRESHOLD + 10);
    const { top } = columnScrollViewport(data);
    // rola o suficiente para a primeira coluna sair por cima
    const anchor = columnAnchorY(data, 'col_0', COLUMN_SCROLL_VIEW_H)!;
    expect(anchor.kind).toBe('above');
    expect(anchor.y).toBeCloseTo(top + PORT_INSET, 5);
    expect(anchor.y).toBeGreaterThan(TABLE_HEADER_H);
  });

  it('nunca ultrapassa o rodapé nem o cabeçalho do cartão', () => {
    const data = tableWithCols(COLUMN_VIRTUALIZE_THRESHOLD + 10);
    const maxY = tableBodyHeight(data) - TABLE_FOOTER_H;
    for (const col of ['col_0', 'col_55', 'col_57']) {
      for (const scroll of [0, 200, 800]) {
        const anchor = columnAnchorY(data, col, scroll)!;
        expect(anchor.y).toBeLessThan(maxY);
        expect(anchor.y).toBeGreaterThan(TABLE_HEADER_H);
      }
    }
  });
});
