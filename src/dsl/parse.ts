// Parse de DBML no browser (@dbml/core) -> nós/arestas para o React Flow.
import { Parser } from '@dbml/core';
import {
  extractRecords,
  parseLayerGroup,
  parseLineageBlock,
  parseLineageFieldsBlock,
  splitTableColumn,
  type ParsedFieldLineage,
  type ParsedLayerGroup,
  type ParsedLineage,
} from './dbmlClean';
import type { ParsedRecords } from './records';
import { resolveParseErrorLine } from './lineLocate';

export {
  extractRecords,
  parseLayerGroup,
  parseLineageBlock,
  parseLineageFieldsBlock,
  splitTableColumn,
  type ParsedFieldLineage,
  type ParsedLayerGroup,
  type ParsedLineage,
} from './dbmlClean';

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
export type ParseResult = {
  tables: TableView[];
  refs: RefView[];
  records: ParsedRecords[];
  layerGroups: ParsedLayerGroup[];
  lineage: ParsedLineage[];
  lineageFields: ParsedFieldLineage[];
  error?: string;
  /** Linha 0-based no buffer do editor (quando disponível). */
  errorLine?: number;
};

const qualified = (schema: string | undefined, name: string) =>
  schema && schema !== 'public' ? `${schema}.${name}` : name;

/** Extrai mensagem e linha do CompilerError do @dbml/core (linha ainda no buffer clean). */
function formatParseError(e: any): { rawMessage: string; cleanLine0?: number } {
  const diag = e?.diags?.[0];
  if (diag?.message) {
    const line1 = diag.location?.start?.line as number | undefined;
    const cleanLine0 = line1 != null ? line1 - 1 : undefined;
    return { rawMessage: diag.message, cleanLine0 };
  }
  return { rawMessage: e?.message ?? 'DBML inválido' };
}

function buildParseError(
  dbml: string,
  rawMessage: string,
  cleanLine0: number | undefined,
  mapCleanLine: (n: number) => number,
): { message: string; line?: number } {
  const line0 = resolveParseErrorLine(dbml, rawMessage, cleanLine0, mapCleanLine);
  const line1 = line0 != null ? line0 + 1 : undefined;
  const message = line1 ? `Linha ${line1}: ${rawMessage}` : rawMessage;
  return { message, line: line0 };
}

export function parseDbml(dbml: string): ParseResult {
  if (!dbml.trim()) {
    return { tables: [], refs: [], records: [], layerGroups: [], lineage: [], lineageFields: [] };
  }
  const { clean, records, layerGroups, lineage, lineageFields, mapCleanLineToOriginal } =
    extractRecords(dbml);
  let db: any;
  try {
    db = Parser.parse(clean, 'dbml');
  } catch (e: any) {
    const { rawMessage, cleanLine0 } = formatParseError(e);
    const { message, line } = buildParseError(dbml, rawMessage, cleanLine0, mapCleanLineToOriginal);
    return {
      tables: [], refs: [], records, layerGroups, lineage, lineageFields, error: message, errorLine: line,
    };
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

  return { tables, refs, records, layerGroups, lineage, lineageFields };
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
