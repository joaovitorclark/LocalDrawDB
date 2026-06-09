// Strip de blocos custom do DBML antes do @dbml/core (compartilhado frontend + servidor).
import { splitDbmlBlocks } from './blocks';
import { parseRecords, type ParsedRecords } from './records';

export type ParsedLayerGroup = { id: string; name: string; color?: string; tables: string[] };
export type ParsedLineage = { target: string; sources: string[] };
export type ParsedFieldLineage = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  note?: string;
  ref?: string;
};

/** Faz parse de um bloco `LayerGroup nome [color: #hex] { ... }`. */
export function parseLayerGroup(block: string): ParsedLayerGroup | null {
  const h = /LayerGroup\s+("?[^"\s[{]+"?)\s*(?:\[([^\]]*)\])?\s*\{/i.exec(block);
  if (!h) return null;
  const name = h[1].replace(/"/g, '');
  const color = /color\s*:\s*(#?[\w]+)/i.exec(h[2] || '')?.[1];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const tables = inner.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  return { id: name.toLowerCase(), name, color, tables };
}

/** Faz parse de um bloco `Lineage { target < source1, source2 }`. */
export function parseLineageBlock(block: string): ParsedLineage[] {
  const h = /Lineage\s*\{/i.exec(block);
  if (!h) return [];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const out: ParsedLineage[] = [];
  for (const rawLine of inner.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const m = /^([^\s<]+)\s*<\s*(.+)$/.exec(line);
    if (!m) continue;
    const target = m[1].trim();
    const sources = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    if (target && sources.length) out.push({ target, sources });
  }
  return out;
}

/** `schema.tabela.coluna` → { table, column }. */
export function splitTableColumn(qualified: string): { table: string; column: string } | null {
  const q = qualified.trim().replace(/"/g, '');
  const last = q.lastIndexOf('.');
  if (last <= 0) return null;
  const table = q.slice(0, last);
  const column = q.slice(last + 1);
  if (!table || !column) return null;
  return { table, column };
}

function parseFieldLineageSettings(bracket: string | undefined): { note?: string; ref?: string } {
  if (!bracket?.trim()) return {};
  const note = /note\s*:\s*'([^']*)'/i.exec(bracket)?.[1];
  const ref = /ref\s*:\s*'([^']*)'/i.exec(bracket)?.[1];
  return { note, ref };
}

/** Parse de `LineageFields { target.tbl.col < source.tbl.col [note: '...', ref: '...'] }`. */
export function parseLineageFieldsBlock(block: string): ParsedFieldLineage[] {
  const h = /LineageFields\s*\{/i.exec(block);
  if (!h) return [];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const out: ParsedFieldLineage[] = [];
  for (const rawLine of inner.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const m = /^([^\s<]+)\s*<\s*([^\s\[]+)(?:\s*\[([^\]]*)\])?\s*$/.exec(line);
    if (!m) continue;
    const target = splitTableColumn(m[1].trim());
    const source = splitTableColumn(m[2].trim());
    if (!target || !source) continue;
    const meta = parseFieldLineageSettings(m[3]);
    out.push({
      targetTable: target.table,
      targetColumn: target.column,
      sourceTable: source.table,
      sourceColumn: source.column,
      ...meta,
    });
  }
  return out;
}

const CUSTOM_TYPES = new Set(['records', 'layerGroup', 'lineage', 'lineageFields']);

/** Remove blocos extras antes do @dbml/core. */
export function cleanDbml(src: string): string {
  const blocks = splitDbmlBlocks(src);
  const keep: string[] = [];
  for (const b of blocks) {
    if (!CUSTOM_TYPES.has(b.type) && b.type !== 'blank') keep.push(b.text);
  }
  return keep.join('\n');
}

/** Mapeia linha 0-based do buffer "clean" (sem blocos custom) → linha 0-based no editor. */
export type CleanLineMap = (cleanLine0: number) => number;

function buildCleanFromBlocks(
  blocks: ReturnType<typeof splitDbmlBlocks>,
): { clean: string; mapCleanLineToOriginal: CleanLineMap } {
  const keepTexts: string[] = [];
  const lineOrigins: number[] = [];
  for (const b of blocks) {
    if (CUSTOM_TYPES.has(b.type) || b.type === 'blank') continue;
    const start = b.lineStart ?? 0;
    const blines = b.text.split('\n');
    for (let i = 0; i < blines.length; i++) lineOrigins.push(start + i);
    keepTexts.push(b.text);
  }
  const mapCleanLineToOriginal = (cleanLine0: number) => lineOrigins[cleanLine0] ?? cleanLine0;
  return { clean: keepTexts.join('\n'), mapCleanLineToOriginal };
}

/** Remove blocos extras e extrai metadados custom (Records, LayerGroup, Lineage, …). */
export function extractRecords(src: string): {
  clean: string;
  records: ParsedRecords[];
  layerGroups: ParsedLayerGroup[];
  lineage: ParsedLineage[];
  lineageFields: ParsedFieldLineage[];
  mapCleanLineToOriginal: CleanLineMap;
} {
  const blocks = splitDbmlBlocks(src);
  const records: ParsedRecords[] = [];
  const layerGroups: ParsedLayerGroup[] = [];
  const lineage: ParsedLineage[] = [];
  const lineageFields: ParsedFieldLineage[] = [];
  for (const b of blocks) {
    if (b.type === 'records') {
      const pr = parseRecords(b.text);
      if (pr) records.push(pr);
    } else if (b.type === 'layerGroup') {
      const lg = parseLayerGroup(b.text);
      if (lg) layerGroups.push(lg);
    } else if (b.type === 'lineage') {
      lineage.push(...parseLineageBlock(b.text));
    } else if (b.type === 'lineageFields') {
      lineageFields.push(...parseLineageFieldsBlock(b.text));
    }
  }
  const { clean, mapCleanLineToOriginal } = buildCleanFromBlocks(blocks);
  return { clean, records, layerGroups, lineage, lineageFields, mapCleanLineToOriginal };
}
