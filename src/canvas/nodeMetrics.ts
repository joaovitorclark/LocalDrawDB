import type { TableView } from '../dsl/parse';

const BASE_W = 230;
const MAX_W = 320;
const COMPACT_H = 56;
const HEADER_H = 34;
const ROW_H = 25;
const FOOTER_H = 26;
/** Padding do shell em modo linhagem (.table-node-shell--lineage). */
const LINEAGE_SHELL_PAD = 20;
/** Folga extra só no autolayout (cartão real costuma ser um pouco maior). */
const LAYOUT_SAFETY = 12;

export type NodeMetricsOpts = { compact?: boolean; /** Inclui folga para autolayout anti-colisão. */ layout?: boolean };

/** Largura estimada do cartão (React Flow mede o shell). */
export function nodeWidth(t: TableView, opts: NodeMetricsOpts = {}): number {
  const titleBonus = Math.max(0, t.id.length - 24) * 4;
  const colBonus = Math.min(40, t.columns.length * 2);
  let w = Math.min(MAX_W, Math.max(BASE_W, BASE_W + titleBonus + colBonus));
  if (opts.compact) w = Math.max(w, 168 + LINEAGE_SHELL_PAD);
  if (opts.layout) w += LAYOUT_SAFETY + (opts.compact ? LINEAGE_SHELL_PAD : 0);
  return w;
}

/** Altura estimada do cartão. */
export function nodeHeight(t: TableView, opts: NodeMetricsOpts = {}): number {
  let h = opts.compact ? COMPACT_H : HEADER_H + t.columns.length * ROW_H + FOOTER_H;
  if (opts.compact) h += LINEAGE_SHELL_PAD;
  if (opts.layout) h += LAYOUT_SAFETY;
  return h;
}
