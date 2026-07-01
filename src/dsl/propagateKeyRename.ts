import { classifyChildFks } from './rolename';
import { renameColumn } from './edit';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renomeia a coluna-chave na mãe e propaga só para FKs herdadas; rolename/divergente ficam. */
export function propagateKeyRename(src: string, parentTable: string, oldCol: string, newCol: string): string {
  const decisions = classifyChildFks(src, parentTable, oldCol);

  // 1) renomeia a coluna na mãe (definição)
  let out = renameColumn(src, parentTable, oldCol, newCol);

  // 2) atualiza alvos de ref parentTable.oldCol -> parentTable.newCol (Refs + inline)
  const pt = parentTable.replace(/["`]/g, '').trim();
  const oldQ = `${pt}.${oldCol}`;
  const newQ = `${pt}.${newCol}`;
  out = out.replace(new RegExp(`(?<![\\w.])${escapeRegex(oldQ)}(?![\\w])`, 'g'), newQ);

  // 3) FKs filhas herdadas acompanham o nome
  for (const d of decisions) {
    if (d.kind !== 'inherited') continue;
    out = renameColumn(out, d.child.table, oldCol, newCol);
    const childOldQ = `${d.child.table}.${oldCol}`;
    const childNewQ = `${d.child.table}.${newCol}`;
    out = out.replace(new RegExp(`(?<![\\w.])${escapeRegex(childOldQ)}(?![\\w])`, 'g'), childNewQ);
  }
  return out;
}
