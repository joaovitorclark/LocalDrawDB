// Gera um projeto dbt fiel (sources.yml + schema.yml + stubs .sql) a partir do
// modelo canônico. Distingue source de model, deriva tests por coluna (unique,
// not_null, accepted_values, relationships) e materialization por camada.
import yaml from 'js-yaml';
import { pkCols, qualifiedName } from './model.ts';
import type { Column, ColumnTest, Model, Ref, Table } from './model.ts';
import { materializationForLayer, resourceTypeForLayer } from '../src/layers.ts';

export type DbtFile = { path: string; content: string };

const DBT_PROJECT_YML = {
  name: 'localdrawdb',
  version: '1.0.0',
  'config-version': 2,
  profile: 'localdrawdb', // placeholder — ajuste no seu profiles.yml
  'model-paths': ['models'],
  'seed-paths': ['seeds'],
  models: {
    localdrawdb: {
      '+materialized': 'view',
    },
  },
};

const YAML_OPTS = { lineWidth: 100, noRefs: true } as const;

// ---------------------------------------------------------------------------
// Classificação source/model + materialization
// ---------------------------------------------------------------------------

/** Uma tabela é source se o resourceType (explícito ou da camada) for 'source'. */
function isSource(t: Table): boolean {
  if (t.resourceType) return t.resourceType === 'source';
  return resourceTypeForLayer(t.layer?.toLowerCase()) === 'source';
}

/** Materialization: explícita > sugerida pela camada > 'view'. */
function resolveMaterialization(t: Table): string {
  return t.materialization ?? materializationForLayer(t.layer?.toLowerCase()) ?? 'view';
}

const schemaOf = (t: Table) => t.schema ?? 'default';
const sourceNameOf = (t: Table) => t.schema ?? 'raw';

// ---------------------------------------------------------------------------
// Tests por coluna (lista unificada — reuso em F4)
// ---------------------------------------------------------------------------

/**
 * Tests dbt derivados para uma coluna: unique/not_null (de pk/unique/nullable),
 * accepted_values (de Column.tests) e relationships (de Refs cuja origem é a coluna).
 */
export function columnTests(table: Table, col: Column, refs: Ref[]): ColumnTest[] {
  const out: ColumnTest[] = [];
  const inPk = pkCols(table).includes(col.name);
  const composite = (table.compositePks ?? []).some((g) => g.length > 1);
  // PK simples implica unique; PK composta não (unicidade é da combinação).
  if ((inPk && !composite) || col.unique) out.push({ kind: 'unique' });
  if (inPk || col.nullable === false) out.push({ kind: 'not_null' });
  for (const t of col.tests ?? []) {
    if (t.kind === 'accepted_values') out.push(t);
  }
  for (const r of refs) {
    if (r.from.table === table.name && r.from.column === col.name) {
      out.push({ kind: 'relationships', to: r.to.table, field: r.to.column });
    }
  }
  return out;
}

/** Converte um ColumnTest para a forma serializável no schema.yml dbt. */
function testToYaml(t: ColumnTest): string | Record<string, unknown> {
  switch (t.kind) {
    case 'unique':
      return 'unique';
    case 'not_null':
      return 'not_null';
    case 'accepted_values':
      return { accepted_values: { values: t.values } };
    case 'relationships':
      return { relationships: { to: `ref('${t.to}')`, field: t.field } };
  }
}

function columnEntry(table: Table, col: Column, refs: Ref[]): Record<string, unknown> {
  const entry: Record<string, unknown> = { name: col.name };
  if (col.note) entry.description = col.note;
  const tests = columnTests(table, col, refs);
  if (tests.length) entry.data_tests = tests.map(testToYaml);
  return entry;
}

// ---------------------------------------------------------------------------
// Lineage upstream → ref()/source()
// ---------------------------------------------------------------------------

const bareName = (ident: string) => {
  const i = ident.lastIndexOf('.');
  return i >= 0 ? ident.slice(i + 1) : ident;
};

function findTable(model: Model, ident: string): Table | undefined {
  return (
    model.tables.find((t) => t.name === ident || qualifiedName(t) === ident) ??
    model.tables.find((t) => t.name === bareName(ident))
  );
}

/** Tabelas das quais este model depende (lineage L1 primeiro; refs como fallback). */
function upstreams(t: Table, model: Model): string[] {
  const lin = (model.lineage ?? []).find(
    (l) => l.target === t.name || l.target === qualifiedName(t),
  );
  if (lin && lin.sources.length) return lin.sources;
  const fromRefs = model.refs.filter((r) => r.from.table === t.name).map((r) => r.to.table);
  return [...new Set(fromRefs)];
}

/** Expressão Jinja para referenciar um upstream: source() se for source, senão ref(). */
function refExpr(ident: string, model: Model): string {
  const up = findTable(model, ident);
  if (up && isSource(up)) return `{{ source('${sourceNameOf(up)}', '${up.name}') }}`;
  return `{{ ref('${up ? up.name : bareName(ident)}') }}`;
}

const aliasOf = (ident: string, model: Model) => findTable(model, ident)?.name ?? bareName(ident);

function renderTags(tags: string[]): string {
  return `[${tags.map((t) => `'${t}'`).join(', ')}]`;
}

function modelSql(t: Table, model: Model): string {
  const mat = resolveMaterialization(t);
  const tagsArg = t.tags?.length ? `, tags=${renderTags(t.tags)}` : '';
  const header =
    `{{ config(materialized='${mat}'${tagsArg}) }}\n\n` +
    `-- TODO: substituir pela lógica real de transformação\n`;
  const cols = t.columns.map((c) => `    ${c.name}`).join(',\n');
  const ups = upstreams(t, model);
  if (!ups.length) {
    return header + `select\n${cols}\nfrom {{ source('raw', '${t.name}') }}\n`;
  }
  const ctes = ups
    .map((u) => `${aliasOf(u, model)} as (\n    select * from ${refExpr(u, model)}\n)`)
    .join(',\n');
  return header + `\nwith ${ctes}\n\nselect\n${cols}\nfrom ${aliasOf(ups[0], model)}\n`;
}

// ---------------------------------------------------------------------------
// Documentos YAML (sources.yml / schema.yml)
// ---------------------------------------------------------------------------

function sourcesYml(schema: string, tables: Table[], refs: Ref[]): string {
  const doc = {
    version: 2,
    sources: [
      {
        name: schema,
        schema,
        tables: tables.map((t) => {
          const tbl: Record<string, unknown> = { name: t.name };
          if (t.note) tbl.description = t.note;
          tbl.columns = t.columns.map((c) => columnEntry(t, c, refs));
          return tbl;
        }),
      },
    ],
  };
  return yaml.dump(doc, YAML_OPTS);
}

function schemaYml(tables: Table[], model: Model): string {
  const doc = {
    version: 2,
    models: tables.map((t) => {
      const config: Record<string, unknown> = { materialized: resolveMaterialization(t) };
      if (t.tags?.length) config.tags = t.tags;
      const entry: Record<string, unknown> = { name: t.name };
      if (t.note) entry.description = t.note;
      entry.config = config;
      entry.columns = t.columns.map((c) => columnEntry(t, c, model.refs));
      return entry;
    }),
  };
  return yaml.dump(doc, YAML_OPTS);
}

// ---------------------------------------------------------------------------
// Montagem do projeto
// ---------------------------------------------------------------------------

/** Lista de arquivos do projeto dbt (caminhos relativos à raiz dbt). */
export function modelToDbtFiles(model: Model): DbtFile[] {
  const files: DbtFile[] = [
    { path: 'dbt_project.yml', content: yaml.dump(DBT_PROJECT_YML, { noRefs: true }) },
  ];

  // Agrupa por schema, separando sources de models.
  const modelsBySchema = new Map<string, Table[]>();
  const sourcesBySchema = new Map<string, Table[]>();
  for (const t of model.tables) {
    const key = schemaOf(t);
    const bucket = isSource(t) ? sourcesBySchema : modelsBySchema;
    bucket.set(key, [...(bucket.get(key) ?? []), t]);
  }

  for (const [schema, tables] of sourcesBySchema) {
    files.push({ path: `models/${schema}/sources.yml`, content: sourcesYml(schema, tables, model.refs) });
  }

  for (const [schema, tables] of modelsBySchema) {
    for (const t of tables) {
      files.push({ path: `models/${schema}/${t.name}.sql`, content: modelSql(t, model) });
    }
    files.push({ path: `models/${schema}/schema.yml`, content: schemaYml(tables, model) });
  }

  return files;
}
