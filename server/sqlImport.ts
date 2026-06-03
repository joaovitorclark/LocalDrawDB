// Import de arquivos .sql (Spark/Hive, Oracle, ANSI) -> modelo canônico.
import { createRequire } from 'node:module';
import { parseTypeName, qualifiedName } from './model.ts';
import type { Column, Model, Ref, Table } from './model.ts';

const require = createRequire(import.meta.url);
const { Parser } = require('node-sql-parser') as { Parser: new () => { astify: Function } };

const sqlParser = new Parser();

export type SqlDialect = 'oracle' | 'spark' | 'ansi';

export function detectSqlDialect(sql: string): SqlDialect {
  if (/VARCHAR2|NUMBER\s*\(|COMMENT\s+ON|TABLESPACE|PCTFREE/i.test(sql)) return 'oracle';
  if (/USING\s+DELTA|USING\s+PARQUET|\bSTRING\b/i.test(sql) && !/VARCHAR\s*\(/i.test(sql)) return 'spark';
  return 'ansi';
}

/** Remove cláusulas Oracle/Spark após o fechamento do bloco de colunas. */
function stripPostColumnClauses(stmt: string, closeIdx: number): string {
  let end = closeIdx + 1;
  while (end < stmt.length && /\s/.test(stmt[end])) end++;
  const tail = stmt.slice(end).trimStart();
  if (/^(USING|TABLESPACE|STORAGE|PCTFREE|PARTITIONED|TBLPROPERTIES|LOCATION|COMMENT)\b/i.test(tail)) {
    return stmt.slice(0, end).trim();
  }
  return stmt;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Remove linhas `-- …` antes de extrair FK do DDL (evita exemplos no cabeçalho do arquivo). */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => (line.trimStart().startsWith('--') ? '' : line))
    .join('\n');
}

/** Índice da linha `CREATE TABLE …` no SQL fonte (mesma chave de `extractMetaComments`). */
function findCreateLineInSource(sql: string, table: Pick<Table, 'name' | 'schema'>): number {
  const q = qualifiedName(table).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `create\\s+(?:external\\s+|temporary\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?(?:[\`"]?)?${q}(?:[\`"]?)?\\s*\\(`,
    'i',
  );
  const lines = sql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

type TableMeta = {
  layer?: string;
  group?: string;
  note?: string;
  fks: Array<{ fromCol: string; toTable: string; toCol: string }>;
};

/** Metadados `-- @layer`, `@group`, `@note`, `@fk` / `@ref` acima do CREATE. */
function extractMetaComments(sql: string): Map<number, TableMeta> {
  const meta = new Map<number, TableMeta>();
  const lines = sql.split('\n');
  let pending: TableMeta = { fks: [] };

  const flush = (lineIdx: number) => {
    if (!pending.layer && !pending.group && !pending.note && !pending.fks.length) return;
    meta.set(lineIdx, {
      layer: pending.layer,
      group: pending.group,
      note: pending.note,
      fks: [...pending.fks],
    });
    pending = { fks: [] };
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const fkMatch = /^--\s*@(?:fk|ref)\s*:\s*(.+)$/i.exec(trimmed);
    if (fkMatch) {
      const parsed = parseFkComment(fkMatch[1]);
      if (parsed) pending.fks.push(parsed);
      continue;
    }
    const metaMatch = /^--\s*@(\w+)\s*:\s*(.+)$/.exec(trimmed);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      if (key === 'layer') pending.layer = metaMatch[2].trim();
      else if (key === 'group') pending.group = metaMatch[2].trim();
      else if (key === 'note') pending.note = metaMatch[2].trim();
      continue;
    }
    if (/create\s+(?:external\s+|temporary\s+)?table/i.test(trimmed)) {
      flush(i);
    } else if (trimmed && !trimmed.startsWith('--')) {
      pending = { fks: [] };
    }
  }
  return meta;
}

/** `customer_id -> raw.customers.id` */
function parseFkComment(text: string): { fromCol: string; toTable: string; toCol: string } | null {
  const m = /^([A-Za-z_][\w]*)\s*->\s*([A-Za-z0-9_.]+)\.([A-Za-z_][\w]*)$/i.exec(text.trim());
  if (!m) return null;
  return { fromCol: m[1], toTable: m[2], toCol: m[3] };
}

function sanitizeCreateTable(stmt: string): { schema?: string; name: string; body: string; raw: string } | null {
  const cleaned = stmt.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  const head = /create\s+(?:external\s+|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_."]+)\s*\(/i.exec(
    cleaned,
  );
  if (!head) return null;

  const open = head.index + head[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < cleaned.length; i++) {
    if (cleaned[i] === '(') depth++;
    else if (cleaned[i] === ')') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return null;

  const rawName = head[1].replace(/"/g, '');
  const parts = rawName.split('.');
  const name = parts.pop()!;
  const schema = parts.length ? parts.join('.') : undefined;
  const body = cleaned.slice(open, close + 1);
  const raw = stripPostColumnClauses(cleaned, close);

  return { schema, name, body, raw };
}

function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

type ParseColResult = { columns: Column[]; compositePks: string[][] };

function applyPkSets(columns: Column[], pkNames: string[], compositePks: string[][]): void {
  if (pkNames.length > 1) {
    compositePks.push(pkNames);
    for (const n of pkNames) {
      const c = columns.find((x) => x.name === n);
      if (c) {
        c.pk = true;
        c.nullable = false;
      }
    }
  } else if (pkNames.length === 1) {
    const c = columns.find((x) => x.name === pkNames[0]);
    if (c) {
      c.pk = true;
      c.nullable = false;
    }
  }
}

function parseColumnsFallback(body: string): ParseColResult {
  const inner = body.trim().replace(/^\(/, '').replace(/\)$/, '');
  const compositePks: string[][] = [];
  const columns: Column[] = [];

  for (const part of splitTopLevel(inner)) {
    const pkInline = /\bprimary\s+key\b/i.test(part);
    const pkm = /(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(part);
    if (pkm) {
      const names = pkm[1].split(',').map((c) => c.replace(/[`"\s]/g, '').trim()).filter(Boolean);
      applyPkSets(columns, names, compositePks);
      continue;
    }
    if (/^(constraint|foreign\s+key|unique|key|index)\b/i.test(part)) continue;

    const m = /^([`"]?[A-Za-z_][\w]*[`"]?)\s+(.+)$/i.exec(part);
    if (!m) continue;
    const name = m[1].replace(/[`"]/g, '');
    let rest = m[2];
    const refInline = /\breferences\s+([A-Za-z0-9_."]+)\s*\(\s*([A-Za-z_][\w]*)\s*\)/i.exec(rest);
    if (refInline) rest = rest.slice(0, refInline.index).trim();

    const typeMatch = /^([A-Za-z0-9_]+(?:\s*\([^)]*\))?)/i.exec(rest);
    const { base, args } = parseTypeName(typeMatch ? typeMatch[1] : rest);
    const col: Column = {
      name,
      type: base,
      args,
      nullable: /\bnot\s+null\b/i.test(rest) ? false : true,
    };
    if (pkInline) {
      col.pk = true;
      col.nullable = false;
    }
    columns.push(col);
  }

  return { columns, compositePks };
}

function splitFkColumnList(inner: string): string[] {
  return inner.split(',').map((c) => c.replace(/[`"\s]/g, '').trim()).filter(Boolean);
}

/** FKs no CREATE: CONSTRAINT … FOREIGN KEY (cols) REFERENCES t (cols) — simples ou composta. */
function extractForeignKeysFromStmt(
  stmt: string,
  table: Pick<Table, 'name' | 'schema'>,
  warnings: string[],
): Ref[] {
  const refs: Ref[] = [];
  const fromTable = qualifiedName(table);

  const fkRe =
    /(?:constraint\s+\w+\s+)?foreign\s+key\s*\(([^)]*)\)\s*references\s+([`"]?[A-Za-z0-9_."]+)\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = fkRe.exec(stmt)) !== null) {
    const fromCols = splitFkColumnList(m[1]);
    const toTable = m[2].replace(/[`"]/g, '');
    const toCols = splitFkColumnList(m[3]);
    if (fromCols.length !== toCols.length) {
      warnings.push(
        `FK em ${fromTable}: ${fromCols.length} coluna(s) de origem != ${toCols.length} em ${toTable}`,
      );
      continue;
    }
    for (let i = 0; i < fromCols.length; i++) {
      refs.push({
        from: { table: fromTable, column: fromCols[i] },
        to: { table: toTable, column: toCols[i] },
        kind: '>',
      });
    }
  }

  const inlineRe =
    /([`"]?[A-Za-z_][\w]*[`"]?)\s+[A-Za-z0-9_]+(?:\([^)]*\))?\s+references\s+([`"]?[A-Za-z0-9_."]+)\s*\(\s*([`"]?[A-Za-z_][\w]*[`"]?)\s*\)/gi;
  while ((m = inlineRe.exec(stmt)) !== null) {
    const fromCol = m[1].replace(/[`"]/g, '');
    refs.push({
      from: { table: fromTable, column: fromCol },
      to: { table: m[2].replace(/[`"]/g, ''), column: m[3].replace(/[`"]/g, '') },
      kind: '>',
    });
  }

  return refs;
}

function metaFksToRefs(
  fks: TableMeta['fks'],
  table: Pick<Table, 'name' | 'schema'>,
): Ref[] {
  const fromTable = qualifiedName(table);
  return fks.map((fk) => ({
    from: { table: fromTable, column: fk.fromCol },
    to: { table: fk.toTable, column: fk.toCol },
    kind: '>' as const,
  }));
}

export function createTableToTable(stmt: string): Table | null {
  const san = sanitizeCreateTable(stmt);
  if (!san) return null;

  let columns: Column[] = [];
  let compositePks: string[][] = [];

  try {
    const ast = sqlParser.astify(`CREATE TABLE ${san.name} ${san.body}`, { database: 'hive' });
    const node = Array.isArray(ast) ? ast[0] : ast;
    const defs: any[] = node.create_definitions ?? [];

    const pkCols = new Set<string>();
    for (const d of defs) {
      if (d.resource === 'constraint' && d.constraint_type === 'primary key') {
        const cols = (d.definition ?? []).map((x: any) => x.column);
        if (cols.length > 1) compositePks.push(cols);
        cols.forEach((c: string) => pkCols.add(c));
      }
    }
    for (const d of defs) {
      if (d.resource !== 'column') continue;
      const colName = d.column.column;
      const def = d.definition ?? {};
      const args =
        def.length != null
          ? def.scale != null
            ? `${def.length},${def.scale}`
            : `${def.length}`
          : undefined;
      columns.push({
        name: colName,
        type: String(def.dataType ?? 'string').toLowerCase(),
        args,
        pk: pkCols.has(colName),
        nullable: d.nullable?.type === 'not null' ? false : true,
      });
    }
  } catch {
    // fallback abaixo
  }

  if (!columns.length) {
    const parsed = parseColumnsFallback(san.body);
    columns = parsed.columns;
    compositePks = parsed.compositePks;
  } else if (!compositePks.length) {
    const parsed = parseColumnsFallback(san.body);
    compositePks = parsed.compositePks;
  }

  if (!columns.length) return null;
  const table: Table = { name: san.name, schema: san.schema, columns };
  if (compositePks.length) table.compositePks = compositePks;
  return table;
}

function parseInserts(sql: string, tableName: string): { columns: string[]; rows: string[][] } {
  const rows: string[][] = [];
  const colsSet = new Set<string>();
  const re = new RegExp(
    `INSERT\\s+INTO\\s+(?:\\w+\\.)?${tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\(([^)]+)\\))?\\s*VALUES\\s*\\(([^)]+)\\)`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (m[1]) m[1].split(',').forEach((c) => colsSet.add(c.trim().replace(/[`"]/g, '')));
    const vals = m[2].split(',').map((v) => v.trim().replace(/^'(.*)'$/, '$1'));
    rows.push(vals);
  }
  return { columns: [...colsSet], rows };
}

function refDedupeKey(r: Ref): string {
  return `${r.from.table}.${r.from.column}->${r.to.table}.${r.to.column}`.toLowerCase();
}

function unquoteSqlString(s: string): string {
  return s.replace(/''/g, "'");
}

/** `COMMENT ON TABLE/COLUMN` (Oracle) → notes no modelo. */
function extractOracleComments(sql: string): {
  tables: Map<string, string>;
  columns: Map<string, Map<string, string>>;
} {
  const tables = new Map<string, string>();
  const columns = new Map<string, Map<string, string>>();

  const tableRe =
    /COMMENT\s+ON\s+TABLE\s+([`"]?)([A-Za-z0-9_.]+)\1\s+IS\s+'((?:[^']|'')*)'/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) {
    tables.set(m[2].replace(/[`"]/g, '').toLowerCase(), unquoteSqlString(m[3]));
  }

  const colRe =
    /COMMENT\s+ON\s+COLUMN\s+([`"]?)([A-Za-z0-9_.]+)\1\.([`"]?)([A-Za-z_][\w]*)\3\s+IS\s+'((?:[^']|'')*)'/gi;
  while ((m = colRe.exec(sql)) !== null) {
    const qname = m[2].replace(/[`"]/g, '').toLowerCase();
    const col = m[4];
    if (!columns.has(qname)) columns.set(qname, new Map());
    columns.get(qname)!.set(col.toLowerCase(), unquoteSqlString(m[5]));
  }

  return { tables, columns };
}

function applyOracleComments(tables: Table[], sql: string): void {
  const { tables: tNotes, columns: cNotes } = extractOracleComments(sql);
  for (const t of tables) {
    const key = qualifiedName(t).toLowerCase();
    const tNote = tNotes.get(key);
    if (tNote && !t.note) {
      t.note = tNote;
      t.noteInRecordsOnly = true;
    }
    const colMap = cNotes.get(key);
    if (!colMap) continue;
    for (const c of t.columns) {
      const cn = colMap.get(c.name.toLowerCase());
      if (cn && !c.note) c.note = cn;
    }
  }
}

/** Parse completo: tabelas + refs + metadados. */
export function sqlToModel(sql: string): Model {
  const tables: Table[] = [];
  const refs: Ref[] = [];
  const warnings: string[] = [];
  const refSeen = new Set<string>();
  const metaMap = extractMetaComments(sql);
  const stmts = splitStatements(sql);

  const addRef = (r: Ref) => {
    const k = refDedupeKey(r);
    if (refSeen.has(k)) return;
    refSeen.add(k);
    refs.push(r);
  };

  for (const stmt of stmts) {
    if (!/create\s+(?:external\s+|temporary\s+)?table/i.test(stmt)) continue;
    const t = createTableToTable(stmt);
    if (!t) continue;

    const createLine = findCreateLineInSource(sql, t);
    const meta = createLine >= 0 ? metaMap.get(createLine) : undefined;
    if (meta) {
      if (meta.layer) t.layer = meta.layer;
      if (meta.group) t.group = meta.group;
      if (meta.note) {
        t.note = meta.note;
        t.noteInRecordsOnly = true;
      }
      for (const r of metaFksToRefs(meta.fks, t)) addRef(r);
      metaMap.delete(createLine);
    }

    for (const r of extractForeignKeysFromStmt(stripLineComments(stmt), t, warnings)) addRef(r);

    const inserts = parseInserts(sql, t.name);
    if (inserts.rows.length) {
      t.records = {
        columns: inserts.columns.length ? inserts.columns : t.columns.map((c) => c.name),
        rows: inserts.rows,
      };
    }

    tables.push(t);
  }

  applyOracleComments(tables, sql);
  return { tables, refs, warnings: warnings.length ? warnings : undefined };
}

/** @deprecated Use sqlToModel */
export function sqlToTables(sql: string): Table[] {
  return sqlToModel(sql).tables;
}

export function mergeModel(base: Model, incoming: Model): Model {
  const key = (t: Table) => `${t.schema ?? ''}.${t.name}`.toLowerCase();
  const byKey = new Map(base.tables.map((t) => [key(t), t] as const));
  for (const t of incoming.tables) byKey.set(key(t), t);

  const refSeen = new Set(base.refs.map(refDedupeKey));
  const refs = [...base.refs];
  for (const r of incoming.refs) {
    const k = refDedupeKey(r);
    if (!refSeen.has(k)) {
      refSeen.add(k);
      refs.push(r);
    }
  }

  const warnings = [...(base.warnings ?? []), ...(incoming.warnings ?? [])];
  return {
    tables: [...byKey.values()],
    refs,
    warnings: warnings.length ? warnings : undefined,
  };
}

/** Mescla só tabelas (compat). */
export function mergeTables(model: Model, incoming: Table[]): Model {
  return mergeModel(model, { tables: incoming, refs: [] });
}
