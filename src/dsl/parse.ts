// Parse de DBML no browser (@dbml/core) -> nós/arestas para o React Flow.
import { Parser } from '@dbml/core';
import { splitDbmlBlocks } from './blocks';
import { parseRecords, type ParsedRecords } from './records';

export type Cardinality = '*' | '1';
export type ColumnView = { name: string; type: string; pk: boolean; notNull: boolean; note?: string };
export type TableView = {
  id: string; // schema.tabela (ou tabela)
  name: string;
  schema?: string;
  group?: string;
  note?: string;
  compositePks?: string[][];
  columns: ColumnView[];
};
export type RefView = {
  id: string;
  source: string;
  target: string;
  label: string;
  fromCol: string;
  toCol: string;
  fromRel: Cardinality; // cardinalidade do lado source
  toRel: Cardinality; // cardinalidade do lado target
};
export type ParsedLayerGroup = { id: string; name: string; color?: string; tables: string[] };
export type ParsedLineage = { target: string; sources: string[] };
export type ParseResult = {
  tables: TableView[];
  refs: RefView[];
  records: ParsedRecords[];
  layerGroups: ParsedLayerGroup[];
  lineage: ParsedLineage[];
  error?: string;
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

/** Remove blocos `records`, `LayerGroup` e `Lineage` (não suportados pelo parser) e os devolve à parte. */
export function extractRecords(src: string): {
  clean: string;
  records: ParsedRecords[];
  layerGroups: ParsedLayerGroup[];
  lineage: ParsedLineage[];
} {
  const blocks = splitDbmlBlocks(src);
  const records: ParsedRecords[] = [];
  const layerGroups: ParsedLayerGroup[] = [];
  const lineage: ParsedLineage[] = [];
  const keep: string[] = [];
  for (const b of blocks) {
    if (b.type === 'records') {
      const pr = parseRecords(b.text);
      if (pr) records.push(pr);
    } else if (b.type === 'layerGroup') {
      const lg = parseLayerGroup(b.text);
      if (lg) layerGroups.push(lg);
    } else if (b.type === 'lineage') {
      lineage.push(...parseLineageBlock(b.text));
    } else if (b.type !== 'blank') {
      keep.push(b.text);
    }
  }
  return { clean: keep.join('\n'), records, layerGroups, lineage };
}

const qualified = (schema: string | undefined, name: string) =>
  schema && schema !== 'public' ? `${schema}.${name}` : name;

/** Extrai uma mensagem legível (com linha) do CompilerError do @dbml/core. */
function formatParseError(e: any): string {
  const diag = e?.diags?.[0];
  if (diag?.message) {
    const line = diag.location?.start?.line;
    return line ? `Linha ${line}: ${diag.message}` : diag.message;
  }
  return e?.message ?? 'DBML inválido';
}

export function parseDbml(dbml: string): ParseResult {
  if (!dbml.trim()) return { tables: [], refs: [], records: [], layerGroups: [], lineage: [] };
  // Records/LayerGroup/Lineage quebram o @dbml/core: extraímos antes.
  const { clean, records, layerGroups, lineage } = extractRecords(dbml);
  let db: any;
  try {
    db = Parser.parse(clean, 'dbml');
  } catch (e: any) {
    return { tables: [], refs: [], records, layerGroups, lineage, error: formatParseError(e) };
  }

  const tables: TableView[] = [];
  const refs: RefView[] = [];

  for (const schema of db.schemas) {
    const schemaName = schema.name && schema.name !== 'public' ? schema.name : undefined;
    for (const t of schema.tables) {
      const columns: ColumnView[] = t.fields.map((f: any) => ({
        name: f.name,
        type: f.type.type_name,
        pk: !!f.pk,
        notNull: !!f.not_null,
        note: f.note || undefined,
      }));
      const compositePks: string[][] = [];
      for (const idx of (t as any).indexes ?? []) {
        const cols = (idx.columns ?? []).map((c: any) => (typeof c === 'string' ? c : c.name));
        if (idx.pk && cols.length > 1) {
          compositePks.push(cols);
          for (const n of cols) {
            const col = columns.find((c) => c.name === n);
            if (col) col.pk = true;
          }
        }
      }
      tables.push({
        id: qualified(schemaName, t.name),
        name: t.name,
        schema: schemaName,
        group: t.group?.name || undefined,
        note: t.note || undefined,
        compositePks: compositePks.length ? compositePks : undefined,
        columns,
      });
    }
    for (const r of schema.refs) {
      const [a, b] = r.endpoints;
      const from = a.relation === '*' ? a : b;
      const to = from === a ? b : a;
      const sourceId = qualified(from.schemaName, from.tableName);
      const targetId = qualified(to.schemaName, to.tableName);
      refs.push({
        id: `${sourceId}.${from.fieldNames[0]}->${targetId}.${to.fieldNames[0]}`,
        source: sourceId,
        target: targetId,
        label: `${from.fieldNames[0]} → ${to.fieldNames[0]}`,
        fromCol: from.fieldNames[0],
        toCol: to.fieldNames[0],
        fromRel: from.relation === '*' ? '*' : '1',
        toRel: to.relation === '*' ? '*' : '1',
      });
    }
  }

  for (const rec of records) {
    if (!rec.note) continue;
    const t = tables.find((x) => x.id === rec.table || x.name === rec.table);
    if (t && !t.note) t.note = rec.note;
  }

  return { tables, refs, records, layerGroups, lineage };
}

/** Snippet de colunas de metadados padrão do lakehouse. */
export const METADATA_SNIPPET = [
  '  transact_id string',
  '  ingestion_timestamp timestamp',
  '  capture_timestamp timestamp',
  '  business_hash string',
  '  content_hash string',
  '  operation_type string',
].join('\n');

const SIMPLE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Cita partes do nome (schema.tabela) que não sejam identificadores simples. */
export function dbmlIdent(name: string): string {
  return name
    .split('.')
    .map((part) => (SIMPLE_IDENT.test(part) ? part : `"${part.replace(/"/g, '')}"`))
    .join('.');
}

/** Template de uma nova tabela (nome citado se tiver hífen/espaço). */
export const newTableTemplate = (name: string) =>
  `\nTable ${dbmlIdent(name)} {\n  id bigint [pk]\n${METADATA_SNIPPET}\n}\n`;
