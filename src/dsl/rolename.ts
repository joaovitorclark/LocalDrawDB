// src/dsl/rolename.ts
// Classifica FKs filhas de uma chave-mãe: herdada, rolename (travada) ou divergente.
import { splitDbmlBlocks } from './blocks';
import { parseRolenamesBlock, splitTableColumn } from './dbmlClean';

export type FkChild = { table: string; column: string };
export type RolenameDecision = { child: FkChild; kind: 'inherited' | 'rolename' | 'divergent' };

const strip = (s: string) => s.replace(/["`]/g, '').trim();

/** Coleta FKs (child.col -> parent.col) de blocos Ref e refs inline. */
function collectFks(src: string): { child: FkChild; parent: FkChild }[] {
  const out: { child: FkChild; parent: FkChild }[] = [];
  const blocks = splitDbmlBlocks(src);
  for (const b of blocks) {
    if (b.type === 'ref') {
      const m = /Ref:?\s*([^\s<>-]+)\s*[<>-]+\s*([^\s\[]+)/i.exec(b.text.replace(/["`]/g, ''));
      if (m) {
        const a = splitTableColumn(m[1]);
        const c = splitTableColumn(m[2]);
        if (a && c) out.push({ child: a, parent: c });
      }
    }
    if (b.type === 'table') {
      const tbl = strip(b.name ?? '');
      for (const line of b.text.split('\n')) {
        const fm = /^\s*("?[A-Za-z_][\w]*"?)\s+.*\[.*ref:\s*>\s*([^\s,\]]+)/i.exec(line);
        if (fm) {
          const p = splitTableColumn(fm[2].replace(/["`]/g, ''));
          if (p) out.push({ child: { table: tbl, column: strip(fm[1]) }, parent: p });
        }
      }
    }
  }
  return out;
}

export function classifyChildFks(src: string, parentTable: string, parentColOld: string): RolenameDecision[] {
  const pt = strip(parentTable);
  const pc = strip(parentColOld);
  const rolenames = splitDbmlBlocks(src)
    .filter((b) => b.type === 'rolenames')
    .flatMap((b) => parseRolenamesBlock(b.text));
  const isRolename = (c: FkChild) =>
    rolenames.some((r) => strip(r.child.table) === strip(c.table) && strip(r.child.column) === strip(c.column));

  return collectFks(src)
    .filter((fk) => strip(fk.parent.table) === pt && strip(fk.parent.column) === pc)
    .map((fk) => {
      const child = { table: strip(fk.child.table), column: strip(fk.child.column) };
      if (isRolename(child)) return { child, kind: 'rolename' as const };
      if (child.column === pc) return { child, kind: 'inherited' as const };
      return { child, kind: 'divergent' as const };
    });
}
