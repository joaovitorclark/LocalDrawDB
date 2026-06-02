// Gera um script DDL ANSI para "Reverse Engineer from Script" no erwin Data Modeler.
// NÃO gera o .erwin nativo (binário proprietário GDM) — fora do escopo.
import { qualifiedName, typeToAnsi } from '../model.ts';
import type { Model, Table } from '../model.ts';

function tableToAnsiDDL(t: Table): string {
  const cols = t.columns.map((c) => {
    const type = typeToAnsi(c);
    const notNull = c.nullable === false || c.pk ? ' NOT NULL' : '';
    return `  ${c.name} ${type}${notNull}`;
  });
  const pks = t.columns.filter((c) => c.pk).map((c) => c.name);
  const lines = [...cols];
  if (pks.length) lines.push(`  PRIMARY KEY (${pks.join(', ')})`);
  return `CREATE TABLE ${qualifiedName(t)} (\n${lines.join(',\n')}\n);\n`;
}

function refsToFKs(model: Model): string {
  const out: string[] = [];
  for (const r of model.refs) {
    const name = `fk_${r.from.table}_${r.from.column}`;
    out.push(
      `ALTER TABLE ${r.from.table} ADD CONSTRAINT ${name} ` +
        `FOREIGN KEY (${r.from.column}) REFERENCES ${r.to.table} (${r.to.column});`,
    );
  }
  return out.join('\n');
}

/** Script DDL ANSI único (tabelas + FKs) para reverse-engineer no erwin. */
export function modelToErwinDDL(model: Model): string {
  const tables = model.tables.map(tableToAnsiDDL).join('\n');
  const fks = refsToFKs(model);
  return `-- LocalDrawDB: script para Reverse Engineer from Script (erwin Data Modeler)\n\n${tables}${
    fks ? `\n${fks}\n` : ''
  }`;
}
