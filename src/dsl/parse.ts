// Parse de DBML no browser (@dbml/core) -> nós/arestas para o React Flow.
import { Parser } from '@dbml/core';
import { splitDbmlBlocks } from './blocks';
import { parseRecords, type ParsedRecords } from './records';

export type Cardinality = '*' | '1';
export type ColumnView = { name: string; type: string; pk: boolean; notNull: boolean };
export type TableView = {
  id: string; // schema.tabela (ou tabela)
  name: string;
  schema?: string;
  group?: string;
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
  error?: string;
};

/** Remove blocos `records` (não suportados pelo parser) e os devolve à parte. */
export function extractRecords(src: string): { clean: string; records: ParsedRecords[] } {
  const blocks = splitDbmlBlocks(src);
  const records: ParsedRecords[] = [];
  const keep: string[] = [];
  for (const b of blocks) {
    if (b.type === 'records') {
      const pr = parseRecords(b.text);
      if (pr) records.push(pr);
    } else if (b.type !== 'blank') {
      keep.push(b.text);
    }
  }
  return { clean: keep.join('\n'), records };
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
  if (!dbml.trim()) return { tables: [], refs: [], records: [] };
  // Records quebram o @dbml/core: extraímos antes e preservamos para a amostra.
  const { clean, records } = extractRecords(dbml);
  let db: any;
  try {
    db = Parser.parse(clean, 'dbml');
  } catch (e: any) {
    return { tables: [], refs: [], records, error: formatParseError(e) };
  }

  const tables: TableView[] = [];
  const refs: RefView[] = [];

  for (const schema of db.schemas) {
    const schemaName = schema.name && schema.name !== 'public' ? schema.name : undefined;
    for (const t of schema.tables) {
      tables.push({
        id: qualified(schemaName, t.name),
        name: t.name,
        schema: schemaName,
        group: t.group?.name || undefined,
        columns: t.fields.map((f: any) => ({
          name: f.name,
          type: f.type.type_name,
          pk: !!f.pk,
          notNull: !!f.not_null,
        })),
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

  return { tables, refs, records };
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
