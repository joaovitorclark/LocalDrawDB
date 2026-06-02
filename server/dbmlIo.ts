// Conversão DBML <-> modelo canônico.
// DBML é a fonte de verdade do projeto; o modelo é o intermediário para os geradores.
import { Parser } from '@dbml/core';
import { parseTypeName, qualifiedName } from './model.ts';
import type { Column, Model, Ref, Table } from './model.ts';

const REL_TO_KIND: Record<string, '>' | '<' | '-' | '<>'> = {
  '*': '>', // muitos -> um (lado "from")
  '1': '-',
};

/** Faz parse de uma string DBML para o modelo canônico. */
export function dbmlToModel(dbml: string): Model {
  const db = Parser.parse(dbml, 'dbml');
  const tables: Table[] = [];
  const refs: Ref[] = [];

  for (const schema of db.schemas) {
    const schemaName = schema.name && schema.name !== 'public' ? schema.name : undefined;

    for (const t of schema.tables) {
      const columns: Column[] = t.fields.map((f: any) => {
        const { base, args } = parseTypeName(f.type.type_name);
        return {
          name: f.name,
          type: base,
          args,
          pk: !!f.pk,
          nullable: f.not_null ? false : true,
          note: f.note || undefined,
        };
      });
      tables.push({
        name: t.name,
        schema: schemaName,
        columns,
        note: t.note || undefined,
        group: t.group?.name || undefined,
      });
    }

    for (const r of schema.refs) {
      const [a, b] = r.endpoints;
      // O endpoint "muitos" (relation '*') é o lado FROM (a FK).
      const fromEp = a.relation === '*' ? a : b;
      const toEp = fromEp === a ? b : a;
      // Mantém o nome qualificado (schema.tabela) para gerar refs DBML válidos.
      const epName = (ep: any) =>
        ep.schemaName && ep.schemaName !== 'public'
          ? `${ep.schemaName}.${ep.tableName}`
          : ep.tableName;
      refs.push({
        from: { table: epName(fromEp), column: fromEp.fieldNames[0] },
        to: { table: epName(toEp), column: toEp.fieldNames[0] },
        kind: REL_TO_KIND[fromEp.relation] ?? '>',
      });
    }
  }

  return { tables, refs };
}

function quoteNote(note: string): string {
  return `'${note.replace(/'/g, "\\'")}'`;
}

/** Serializa o modelo canônico de volta para DBML (texto versionável). */
export function modelToDbml(model: Model): string {
  const out: string[] = [];

  for (const t of model.tables) {
    out.push(`Table ${qualifiedName(t)} {`);
    for (const c of t.columns) {
      const type = c.args ? `${c.type}(${c.args})` : c.type;
      const settings: string[] = [];
      if (c.pk) settings.push('pk');
      if (c.nullable === false) settings.push('not null');
      if (c.note) settings.push(`note: ${quoteNote(c.note)}`);
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      out.push(`  ${c.name} ${type}${suffix}`);
    }
    if (t.note) out.push(`  Note: ${quoteNote(t.note)}`);
    out.push('}');
    out.push('');
  }

  for (const r of model.refs) {
    out.push(
      `Ref: ${r.from.table}.${r.from.column} ${r.kind} ${r.to.table}.${r.to.column}`,
    );
  }

  // Agrupamentos viram TableGroups (organização visual).
  const groups = new Map<string, string[]>();
  for (const t of model.tables) {
    if (t.group) {
      const list = groups.get(t.group) ?? [];
      list.push(qualifiedName(t));
      groups.set(t.group, list);
    }
  }
  if (groups.size) out.push('');
  for (const [name, members] of groups) {
    out.push(`TableGroup ${name} {`);
    for (const m of members) out.push(`  ${m}`);
    out.push('}');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
