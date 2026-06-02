// Gera CREATE TABLE Spark/Databricks (Delta) a partir do modelo canônico.
import { qualifiedName, typeToSpark } from '../model.ts';
import type { Model, Table } from '../model.ts';

function tableToSparkDDL(t: Table): string {
  const lines = t.columns.map((c) => {
    const type = typeToSpark(c);
    const notNull = c.nullable === false ? ' NOT NULL' : '';
    const comment = c.note ? ` COMMENT '${c.note.replace(/'/g, "\\'")}'` : '';
    return `  ${c.name} ${type}${notNull}${comment}`;
  });
  const tableComment = t.note ? `\nCOMMENT '${t.note.replace(/'/g, "\\'")}'` : '';
  return (
    `CREATE TABLE IF NOT EXISTS ${qualifiedName(t)} (\n` +
    lines.join(',\n') +
    `\n)\nUSING DELTA${tableComment};\n`
  );
}

/** DDL Spark de todas as tabelas (um script). */
export function modelToSparkDDL(model: Model): string {
  return model.tables.map(tableToSparkDDL).join('\n') + '\n';
}

/** DDL Spark agrupado por schema -> { 'schema.sql': conteúdo }. */
export function sparkDDLBySchema(model: Model): Record<string, string> {
  const bySchema = new Map<string, Table[]>();
  for (const t of model.tables) {
    const key = t.schema ?? 'default';
    bySchema.set(key, [...(bySchema.get(key) ?? []), t]);
  }
  const files: Record<string, string> = {};
  for (const [schema, tables] of bySchema) {
    files[`${schema}.sql`] = tables.map(tableToSparkDDL).join('\n') + '\n';
  }
  return files;
}
