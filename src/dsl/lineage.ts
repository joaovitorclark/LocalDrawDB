import type { LineageLink } from '../api';

/** Adiciona uma ligação de linhagem (sem duplicata nem self-loop). */
export function addLineage(list: LineageLink[], source: string, target: string): LineageLink[] {
  if (!source || !target || source === target) return list;
  if (list.some((l) => l.source === source && l.target === target)) return list;
  return [...list, { source, target }];
}

/** Remove uma ligação de linhagem (qualquer direção informada). */
export function removeLineage(list: LineageLink[], source: string, target: string): LineageLink[] {
  return list.filter((l) => !(l.source === source && l.target === target));
}

/** Converte um lineage.json ({ "tabela": ["origem", ...] }) em pares {source,target}. */
export function lineageFromJson(obj: Record<string, string[]>): LineageLink[] {
  const out: LineageLink[] = [];
  for (const [target, sources] of Object.entries(obj)) {
    for (const s of sources) out.push({ source: s, target });
  }
  return out;
}
