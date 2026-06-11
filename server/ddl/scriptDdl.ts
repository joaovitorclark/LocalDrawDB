// DDL script: CREATE TABLE + ALTER TABLE FK (Oracle, Postgres, erwin/ANSI).
import { pkCols, qualifiedName, type Column, type Model, type Table } from '../model.ts';

export type TypeMapper = (col: Column) => string;

export function sanitizeConstraintId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 60);
}

export function tableToCreateDDL(t: Table, typeFn: TypeMapper): string {
  const cols = t.columns.map((c) => {
    const type = typeFn(c);
    const notNull = c.nullable === false || c.pk ? ' NOT NULL' : '';
    return `  ${c.name} ${type}${notNull}`;
  });
  const pk = pkCols(t);
  const lines = [...cols];
  if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
  return `CREATE TABLE ${qualifiedName(t)} (\n${lines.join(',\n')}\n);\n`;
}

export function refsToAlterFKs(model: Model): string {
  const out: string[] = [];
  for (const r of model.refs) {
    const base = sanitizeConstraintId(`fk_${r.from.table}_${r.from.column}`);
    out.push(
      `ALTER TABLE ${r.from.table} ADD CONSTRAINT ${base} ` +
        `FOREIGN KEY (${r.from.column}) REFERENCES ${r.to.table} (${r.to.column});`,
    );
  }
  return out.join('\n');
}

export function modelToScriptDDL(
  model: Model,
  typeFn: TypeMapper,
  header: string,
): string {
  const tables = model.tables.map((t) => tableToCreateDDL(t, typeFn)).join('\n');
  const fks = refsToAlterFKs(model);
  return `${header}\n\n${tables}${fks ? `\n${fks}\n` : ''}`;
}

/** Agrupa tabelas por schema -> { 'schema.sql': conteúdo }. */
export function scriptDDLBySchema(
  model: Model,
  typeFn: TypeMapper,
  header: string,
): Record<string, string> {
  const bySchema = new Map<string, Table[]>();
  for (const t of model.tables) {
    const key = t.schema ?? 'default';
    bySchema.set(key, [...(bySchema.get(key) ?? []), t]);
  }
  const files: Record<string, string> = {};
  for (const [schema, tables] of bySchema) {
    const sub: Model = { tables, refs: model.refs };
    files[`${schema}.sql`] = modelToScriptDDL(sub, typeFn, header);
  }
  return files;
}
