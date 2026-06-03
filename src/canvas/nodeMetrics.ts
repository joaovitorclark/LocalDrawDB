import type { TableView } from '../dsl/parse';

const BASE_W = 230;
const MAX_W = 320;
const COMPACT_INNER_MIN = 168;
const HEADER_H = 34;
const ROW_H = 25;
const FOOTER_H = 26;
/** Padding do shell em modo linhagem (.table-node-shell--lineage). */
const LINEAGE_SHELL_PAD = 10;
/** Folga extra só no autolayout (cartão real costuma ser um pouco maior). */
const LAYOUT_SAFETY = 16;
const CHAR_W = 7;
const HEADER_LINE_H = 20;

export type NodeMetricsOpts = { compact?: boolean; /** Inclui folga para autolayout anti-colisão. */ layout?: boolean };

function compactInnerWidth(t: TableView, layout: boolean): number {
  const byChars = t.id.length * CHAR_W + 56;
  const inner = Math.max(COMPACT_INNER_MIN, byChars);
  if (layout) return inner + 24;
  return Math.min(MAX_W - LINEAGE_SHELL_PAD * 2, inner);
}

function compactHeaderLines(t: TableView, innerWidth: number): number {
  const charsPerLine = Math.max(8, Math.floor((innerWidth - 52) / CHAR_W));
  return Math.max(1, Math.ceil(t.id.length / charsPerLine));
}

/** Largura estimada do cartão (React Flow mede o shell). */
export function nodeWidth(t: TableView, opts: NodeMetricsOpts = {}): number {
  const titleBonus = Math.max(0, t.id.length - 24) * 4;
  const colBonus = Math.min(40, t.columns.length * 2);
  let w = Math.min(MAX_W, Math.max(BASE_W, BASE_W + titleBonus + colBonus));

  if (opts.compact) {
    const inner = compactInnerWidth(t, !!opts.layout);
    w = Math.max(w, inner + LINEAGE_SHELL_PAD * 2);
  }
  if (opts.layout) {
    w += LAYOUT_SAFETY;
    if (opts.compact) w += LINEAGE_SHELL_PAD;
  }
  return w;
}

/** Altura estimada do cartão. */
export function nodeHeight(t: TableView, opts: NodeMetricsOpts = {}): number {
  if (!opts.compact) {
    let h = HEADER_H + t.columns.length * ROW_H + FOOTER_H;
    if (opts.layout) h += LAYOUT_SAFETY;
    return h;
  }

  const inner = compactInnerWidth(t, !!opts.layout);
  const lines = compactHeaderLines(t, inner);
  let h = 12 + lines * HEADER_LINE_H + 8 + LINEAGE_SHELL_PAD * 2;
  if (opts.layout) h += LAYOUT_SAFETY + 8;
  return h;
}
