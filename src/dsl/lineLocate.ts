import { splitDbmlBlocks } from './blocks';

const stripQuotes = (s: string) => s.replace(/["`]/g, '').trim();

function tableMatches(blockName: string | undefined, target: string): boolean {
  if (!blockName) return false;
  const a = stripQuotes(blockName).toLowerCase();
  const b = stripQuotes(target).toLowerCase();
  if (a === b) return true;
  const lastA = a.split('.').pop()!;
  const lastB = b.split('.').pop()!;
  return lastA === lastB;
}

function parseFieldName(line: string): string | null {
  const m = /^(\s*)("?[A-Za-z_][\w]*"?|"[^"]+")\s+\S/.exec(line);
  return m ? stripQuotes(m[2]) : null;
}

const isFieldLine = (line: string) => {
  const t = line.trim();
  if (!t || t.startsWith('//')) return false;
  if (/^Table\b/i.test(t) || t.startsWith('}') || t === '{') return false;
  if (/^(Note|indexes)\b/i.test(t)) return false;
  return /^("?[A-Za-z_][\w]*"?|"[^"]+")\s+\S/.test(t);
};

/** Linha 0-based no buffer do editor. */
export function lineOfTable(dbml: string, tableId: string): number | undefined {
  for (const b of splitDbmlBlocks(dbml)) {
    if (b.type === 'table' && tableMatches(b.name, tableId)) return b.lineStart;
  }
  return undefined;
}

export function lineOfColumn(dbml: string, tableId: string, column: string): number | undefined {
  for (const b of splitDbmlBlocks(dbml)) {
    if (b.type !== 'table' || !tableMatches(b.name, tableId)) continue;
    const start = b.lineStart ?? 0;
    const lines = b.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!isFieldLine(lines[i])) continue;
      const name = parseFieldName(lines[i]);
      if (name === stripQuotes(column)) return start + i;
    }
  }
  return undefined;
}

export function lineOfRef(dbml: string, source: string, fromCol?: string): number | undefined {
  const needle = fromCol ? `${stripQuotes(source)}.${fromCol}` : stripQuotes(source);
  for (const b of splitDbmlBlocks(dbml)) {
    if (b.type === 'ref' && b.text.replace(/["`]/g, '').includes(needle)) return b.lineStart;
  }
  return lineOfTable(dbml, source);
}
