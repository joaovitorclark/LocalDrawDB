import { splitDbmlBlocks } from './blocks';
import type { CleanLineMap } from './dbmlClean';

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

/** Tabela cujo bloco DBML contém a linha (0-based), inclusive bloco incompleto. */
export function tableAtLine(dbml: string, line0: number): string | null {
  if (line0 < 0) return null;
  for (const b of splitDbmlBlocks(dbml)) {
    if (b.type !== 'table' || b.lineStart == null) continue;
    const end = b.lineStart + b.text.split('\n').length - 1;
    if (line0 >= b.lineStart && line0 <= end) {
      const name = stripQuotes(b.name ?? '');
      return name || null;
    }
  }
  return null;
}

/** Resolve nome do bloco Table → id canônico do modelo parseado. */
export function resolveTableId(blockName: string, tableIds: string[]): string | null {
  const n = stripQuotes(blockName);
  if (!n) return null;
  for (const id of tableIds) {
    if (tableMatches(id, n)) return id;
  }
  return null;
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

/** Linha do membro em LayerGroup ou TableGroup (referência schema.tabela). */
export function lineOfGroupMember(dbml: string, tableId: string): number | undefined {
  for (const b of splitDbmlBlocks(dbml)) {
    if (b.type !== 'layerGroup' && b.type !== 'tableGroup') continue;
    const start = b.lineStart ?? 0;
    const lines = b.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed === '{' || trimmed === '}') continue;
      if (/^(LayerGroup|TableGroup)\b/i.test(trimmed)) continue;
      if (tableMatches(trimmed, tableId)) return start + i;
    }
  }
  return undefined;
}

/** Extrai schema.tabela de mensagens do @dbml/core. */
export function tableIdFromParseError(message: string): string | null {
  const patterns = [
    /Can't find table\s+"([^"]+)"\."([^"]+)"/i,
    /Table\s+"([^"]+)"\.([A-Za-z_][\w]*)\s+don'?t exist/i,
    /Table\s+([A-Za-z0-9_.]+)\s+don'?t exist/i,
    /Can't find table\s+([A-Za-z0-9_.]+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(message);
    if (!m) continue;
    if (m.length >= 3 && m[2]) return `${m[1]}.${m[2]}`;
    return m[1];
  }
  return null;
}

/** Resolve a melhor linha 0-based no buffer original para um erro de parse. */
export function resolveParseErrorLine(
  dbml: string,
  message: string,
  cleanLine0?: number,
  mapCleanLine?: CleanLineMap,
): number | undefined {
  const tableId = tableIdFromParseError(message);
  if (tableId) {
    const memberLine = lineOfGroupMember(dbml, tableId);
    if (memberLine != null) return memberLine;
    const tableLine = lineOfTable(dbml, tableId);
    if (tableLine != null) return tableLine;
  }
  if (cleanLine0 != null && mapCleanLine) return mapCleanLine(cleanLine0);
  return cleanLine0;
}
