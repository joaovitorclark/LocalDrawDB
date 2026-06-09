import { splitDbmlBlocks } from './blocks';
import { isCompleteTableId } from './edit';

const stripQuotes = (s: string) => s.replace(/["`]/g, '').trim();

const isFieldLine = (line: string) => {
  const t = line.trim();
  if (!t || t.startsWith('//')) return false;
  if (/^Table\b/i.test(t) || t.startsWith('}') || t === '{') return false;
  if (/^(Note|indexes)\b/i.test(t)) return false;
  return /^("?[A-Za-z_][\w]*"?|"[^"]+")\s+\S/.test(t);
};

function parseFieldLine(line: string): { name: string; sig: string } | null {
  const m = /^(\s*)("?[A-Za-z_][\w]*"?|"[^"]+")\s+(.*)$/.exec(line);
  if (!m) return null;
  return { name: stripQuotes(m[2]), sig: m[3].trim() };
}

function tableFields(blockText: string): { name: string; sig: string }[] {
  return blockText
    .split('\n')
    .filter(isFieldLine)
    .map(parseFieldLine)
    .filter((x): x is { name: string; sig: string } => !!x);
}

function tableIdFromBlock(name: string | undefined): string {
  return stripQuotes(name ?? '');
}

function columnOverlap(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const setB = new Set(b);
  const match = a.filter((c) => setB.has(c)).length;
  return match / Math.max(a.length, b.length);
}

export type TableRename = { kind: 'table'; oldId: string; newId: string };
export type ColumnRename = { kind: 'column'; table: string; oldCol: string; newCol: string };
export type DetectedRename = TableRename | ColumnRename;

/** Detecta renomeações estruturais entre dois snapshots do DBML (edição livre no editor). */
export function detectRenames(prevDbml: string, nextDbml: string): DetectedRename[] {
  if (prevDbml === nextDbml) return [];

  const prevTables = splitDbmlBlocks(prevDbml).filter((b) => b.type === 'table');
  const nextTables = splitDbmlBlocks(nextDbml).filter((b) => b.type === 'table');
  const renames: DetectedRename[] = [];

  const byLinePrev = new Map(prevTables.map((b) => [b.lineStart ?? -1, b]));
  const byLineNext = new Map(nextTables.map((b) => [b.lineStart ?? -1, b]));

  const lineKeys = [...new Set([...byLinePrev.keys(), ...byLineNext.keys()])].filter((k) => k >= 0);

  for (const lineStart of lineKeys) {
    const pb = byLinePrev.get(lineStart);
    const nb = byLineNext.get(lineStart);
    if (!pb || !nb) continue;

    const oldId = tableIdFromBlock(pb.name);
    const newId = tableIdFromBlock(nb.name);
    const prevFields = tableFields(pb.text);
    const nextFields = tableFields(nb.text);

    if (oldId !== newId) {
      if (!isCompleteTableId(oldId) || !isCompleteTableId(newId)) continue;
      const prevNames = prevFields.map((f) => f.name);
      const nextNames = nextFields.map((f) => f.name);
      if (columnOverlap(prevNames, nextNames) >= 0.8) {
        renames.push({ kind: 'table', oldId, newId });
      }
    }

    const tableId = newId || oldId;
    const len = Math.min(prevFields.length, nextFields.length);
    for (let i = 0; i < len; i++) {
      const pf = prevFields[i];
      const nf = nextFields[i];
      if (pf.name !== nf.name && pf.sig === nf.sig) {
        renames.push({ kind: 'column', table: tableId, oldCol: pf.name, newCol: nf.name });
      }
    }
  }

  return renames;
}
