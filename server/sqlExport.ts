// Export reverso: modelo canônico → SQL no formato data/input/ (Spark ou Oracle).
import { qualifiedName, pkCols, typeToOracle, typeToSpark } from './model.ts';
import type { Column, FieldLineageEntry, Model, Ref, Table } from './model.ts';

export type InputDialect = 'spark' | 'oracle' | 'auto';

const SPARK_LAYERS = new Set(['bronze', 'prata', 'silver', 'gold', 'raw', 'staging_spark']);

function resolveDialect(table: Table, requested: InputDialect): 'spark' | 'oracle' {
  if (requested === 'spark' || requested === 'oracle') return requested;
  const layer = table.layer?.toLowerCase();
  const schema = table.schema?.toLowerCase();
  if (layer && !SPARK_LAYERS.has(layer) && layer !== 'bronze' && layer !== 'prata') {
    if (schema === 'staging' || layer === 'oracle') return 'oracle';
  }
  if (schema === 'staging' && table.columns.some((c) => c.type === 'varchar2' || /^number/i.test(c.type))) {
    return 'oracle';
  }
  if (table.columns.some((c) => /varchar2/i.test(c.type))) return 'oracle';
  return 'spark';
}

function sqlQuote(val: string): string {
  if (/^-?\d+(\.\d+)?$/.test(val)) return val;
  if (/^(true|false|null)$/i.test(val)) return val.toUpperCase();
  if (/^TIMESTAMP\s+'/i.test(val)) return val;
  return `'${val.replace(/'/g, "''")}'`;
}

function refsForTable(model: Model, t: Table): Ref[] {
  const qn = qualifiedName(t);
  return model.refs.filter((r) => r.from.table === qn || r.from.table === t.name);
}

function lineageSourcesForTable(model: Model, t: Table): string[] {
  const qn = qualifiedName(t);
  const entry = model.lineage?.find(
    (l) => l.target === qn || l.target.toLowerCase() === qn.toLowerCase(),
  );
  return entry?.sources ?? [];
}

function fieldMapsForTable(model: Model, t: Table): Map<string, FieldLineageEntry> {
  const qn = qualifiedName(t);
  const map = new Map<string, FieldLineageEntry>();
  for (const field of model.lineageFields ?? []) {
    if (
      field.targetTable === qn ||
      field.targetTable.toLowerCase() === qn.toLowerCase() ||
      field.targetTable === t.name
    ) {
      map.set(field.targetColumn, field);
    }
  }
  return map;
}

function formatMapMeta(field: FieldLineageEntry): string {
  const parts: string[] = [];
  if (field.note) parts.push(`note: '${field.note.replace(/'/g, "''")}'`);
  if (field.ref) parts.push(`ref: '${field.ref.replace(/'/g, "''")}'`);
  return parts.length ? ` [${parts.join(', ')}]` : '';
}

function formatColumnLine(
  c: Column,
  type: string,
  fieldMap?: FieldLineageEntry,
): string {
  const nn = c.nullable === false ? ' NOT NULL' : '';
  const mapSuffix = fieldMap
    ? `, -- @map <- ${fieldMap.sourceTable}.${fieldMap.sourceColumn}${formatMapMeta(fieldMap)}`
    : '';
  return `  ${c.name} ${type}${nn}${mapSuffix}`;
}

function emitMetaComments(t: Table, refs: Ref[], lineageSources: string[]): string[] {
  const lines: string[] = [];
  if (t.layer) lines.push(`-- @layer: ${t.layer}`);
  if (t.group) lines.push(`-- @group: ${t.group}`);
  if (t.note && (t.noteInRecordsOnly || t.records?.rows.length)) {
    lines.push(`-- @note: ${t.note}`);
  }
  if (lineageSources.length) {
    lines.push(`-- @origen: ${lineageSources.join(', ')}`);
  }
  for (const r of refs) {
    lines.push(`-- @fk: ${r.from.column} -> ${r.to.table}.${r.to.column}`);
  }
  return lines;
}

function sparkCreateTable(t: Table, refs: Ref[], fieldMaps: Map<string, FieldLineageEntry>): string {
  const qn = qualifiedName(t);
  const pk = pkCols(t);
  const singlePk = pk.length === 1 ? pk[0] : null;
  const colLines = t.columns.map((c) => {
    const type = typeToSpark(c);
    const col =
      singlePk === c.name ? { ...c, nullable: false } : c;
    return formatColumnLine(col, type, fieldMaps.get(c.name));
  });
  const pkClause = pk.length ? `,\n  PRIMARY KEY (${pk.join(', ')})` : '';
  return (
    `CREATE TABLE IF NOT EXISTS ${qn} (\n` +
    colLines.join(',\n') +
    pkClause +
    `\n) USING DELTA;`
  );
}

function oracleCreateTable(
  t: Table,
  refs: Ref[],
  fieldMaps: Map<string, FieldLineageEntry>,
): string {
  const qn = qualifiedName(t);
  const pk = pkCols(t);
  const shortName = t.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 20);
  const colLines = t.columns.map((c) => {
    const type = typeToOracle(c);
    return formatColumnLine(c, type, fieldMaps.get(c.name));
  });
  const constraints: string[] = [];
  if (pk.length) {
    constraints.push(`  CONSTRAINT pk_${shortName} PRIMARY KEY (${pk.join(', ')})`);
  }
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    constraints.push(
      `  CONSTRAINT fk_${shortName}_${i + 1} FOREIGN KEY (${r.from.column})\n` +
      `    REFERENCES ${r.to.table} (${r.to.column})`,
    );
  }
  const allLines = [...colLines, ...constraints];
  return `CREATE TABLE ${qn} (\n${allLines.join(',\n')}\n);`;
}

function emitInserts(t: Table, dialect: 'spark' | 'oracle'): string[] {
  if (!t.records?.rows.length) return [];
  const qn = qualifiedName(t);
  const cols = t.records.columns.length ? t.records.columns : t.columns.map((c) => c.name);
  const header = `INSERT INTO ${qn} (${cols.join(', ')})`;
  return t.records.rows.map((row) => {
    const vals = row.map(sqlQuote).join(', ');
    return `${header}\nVALUES (${vals});`;
  });
}

function tableToSql(t: Table, model: Model, dialect: InputDialect): string {
  const resolved = resolveDialect(t, dialect);
  const refs = refsForTable(model, t);
  const lineageSources = lineageSourcesForTable(model, t);
  const fieldMaps = fieldMapsForTable(model, t);
  const parts: string[] = [];
  const meta = emitMetaComments(t, refs, lineageSources);
  if (meta.length) parts.push(...meta);
  parts.push(
    resolved === 'oracle'
      ? oracleCreateTable(t, refs, fieldMaps)
      : sparkCreateTable(t, refs, fieldMaps),
  );
  if (t.note && resolved === 'oracle' && !t.noteInRecordsOnly) {
    parts.push(`COMMENT ON TABLE ${qualifiedName(t)} IS '${t.note.replace(/'/g, "''")}';`);
  }
  for (const c of t.columns) {
    if (c.note && resolved === 'oracle') {
      parts.push(
        `COMMENT ON COLUMN ${qualifiedName(t)}.${c.name} IS '${c.note.replace(/'/g, "''")}';`,
      );
    }
  }
  parts.push(...emitInserts(t, resolved));
  return parts.join('\n');
}

/** Gera SQL no formato input/ para um dialeto (ou auto por tabela). */
export function modelToInputSql(model: Model, dialect: InputDialect = 'spark'): string {
  const chunks = model.tables.map((t) => tableToSql(t, model, dialect));
  return chunks.filter(Boolean).join('\n\n') + '\n';
}

/** Agrupa por dialeto resolvido (útil para export misto). */
export function modelToInputSqlByDialect(model: Model): { spark: string; oracle: string } {
  const sparkTables: string[] = [];
  const oracleTables: string[] = [];
  for (const t of model.tables) {
    const sql = tableToSql(t, model, 'auto');
    if (resolveDialect(t, 'auto') === 'oracle') oracleTables.push(sql);
    else sparkTables.push(sql);
  }
  return {
    spark: sparkTables.join('\n\n') + (sparkTables.length ? '\n' : ''),
    oracle: oracleTables.join('\n\n') + (oracleTables.length ? '\n' : ''),
  };
}
