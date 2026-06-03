import type { TableView } from '../dsl/parse';

const BASE_W = 230;
const MAX_W = 320;
const COMPACT_H = 56;
const HEADER_H = 34;
const ROW_H = 25;
const FOOTER_H = 26;

export type NodeMetricsOpts = { compact?: boolean };

/** Largura estimada do cartão (React Flow mede o shell). */
export function nodeWidth(t: TableView, opts: NodeMetricsOpts = {}): number {
  void opts;
  const titleBonus = Math.max(0, t.id.length - 24) * 4;
  const colBonus = Math.min(40, t.columns.length * 2);
  return Math.min(MAX_W, Math.max(BASE_W, BASE_W + titleBonus + colBonus));
}

/** Altura estimada do cartão. */
export function nodeHeight(t: TableView, opts: NodeMetricsOpts = {}): number {
  if (opts.compact) return COMPACT_H;
  return HEADER_H + t.columns.length * ROW_H + FOOTER_H;
}
