// Gera um projeto dbt mínimo (models + schema.yml) a partir do modelo canônico.
import yaml from 'js-yaml';
import { typeToSpark } from './model.ts';
import type { Model, Table } from './model.ts';

export type DbtFile = { path: string; content: string };

const DBT_PROJECT_YML = {
  name: 'localdrawdb',
  version: '1.0.0',
  'config-version': 2,
  profile: 'localdrawdb',
  'model-paths': ['models'],
  models: {
    localdrawdb: {
      '+materialized': 'table',
    },
  },
};

function modelSql(t: Table): string {
  const cols = t.columns.map((c) => `    ${c.name}`).join(',\n');
  return (
    `{{ config(materialized='table') }}\n\n` +
    `-- TODO: substituir pela lógica real de transformação\n` +
    `select\n${cols}\nfrom {{ source('raw', '${t.name}') }}\n`
  );
}

function schemaYml(tables: Table[]): string {
  const doc = {
    version: 2,
    models: tables.map((t) => ({
      name: t.name,
      description: t.note || '',
      columns: t.columns.map((c) => ({
        name: c.name,
        description: c.note || '',
        // tipo lakehouse registrado em meta para referência
        meta: { type: typeToSpark(c) },
        ...(c.pk ? { tests: ['unique', 'not_null'] } : {}),
      })),
    })),
  };
  return yaml.dump(doc, { lineWidth: 100, noRefs: true });
}

/** Lista de arquivos do projeto dbt (caminhos relativos à raiz dbt). */
export function modelToDbtFiles(model: Model): DbtFile[] {
  const files: DbtFile[] = [
    { path: 'dbt_project.yml', content: yaml.dump(DBT_PROJECT_YML, { noRefs: true }) },
  ];

  const bySchema = new Map<string, Table[]>();
  for (const t of model.tables) {
    const key = t.schema ?? 'default';
    bySchema.set(key, [...(bySchema.get(key) ?? []), t]);
  }

  for (const [schema, tables] of bySchema) {
    for (const t of tables) {
      files.push({ path: `models/${schema}/${t.name}.sql`, content: modelSql(t) });
    }
    files.push({ path: `models/${schema}/schema.yml`, content: schemaYml(tables) });
  }

  return files;
}
