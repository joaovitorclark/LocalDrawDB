// Modelo canônico — fonte de verdade intermediária entre DBML, SQL e geradores de DDL.

export type Column = {
  name: string;
  type: string; // tipo base lakehouse, minúsculo: string, decimal, timestamp, int, ...
  args?: string; // parâmetros do tipo, ex.: "15" ou "18,2" (decimal(p,s))
  pk?: boolean;
  nullable?: boolean; // default true
  note?: string;
};

export type Table = {
  name: string;
  schema?: string; // namespace/banco
  columns: Column[];
  note?: string;
  /** Note do import (@note): exportar só no bloco Records, não no Table. */
  noteInRecordsOnly?: boolean;
  group?: string; // TableGroup (organização visual)
  layer?: string; // LayerGroup (import metadata)
  records?: { columns: string[]; rows: string[][] }; // sample data from INSERTs
  compositePks?: string[][]; // PK composta, ex.: [['period','region']]
};

export type Ref = {
  from: { table: string; column: string };
  to: { table: string; column: string };
  kind: '>' | '<' | '-' | '<>'; // n:1, 1:n, 1:1, n:n
};

export type Model = {
  tables: Table[];
  refs: Ref[];
};

/** Quebra "decimal(18,2)" em { base: "decimal", args: "18,2" }. */
export function parseTypeName(typeName: string): { base: string; args?: string } {
  const m = /^\s*([A-Za-z0-9_ ]+?)\s*(?:\(\s*([^)]*)\s*\))?\s*$/.exec(typeName);
  if (!m) return { base: typeName.trim().toLowerCase() };
  return { base: m[1].trim().toLowerCase(), args: m[2]?.replace(/\s+/g, '') || undefined };
}

const emptyName = (n: string) => n.replace(/[`"']/g, '').trim();

/** Identificador qualificado schema.tabela (schema opcional). */
export function qualifiedName(t: Pick<Table, 'name' | 'schema'>): string {
  const name = emptyName(t.name);
  return t.schema ? `${emptyName(t.schema)}.${name}` : name;
}

// ---- Mapas de tipo lakehouse -> alvo ----

const SPARK_ALIASES: Record<string, string> = {
  string: 'STRING',
  varchar: 'STRING',
  integer: 'INT',
  int: 'INT',
  smallint: 'SMALLINT',
  tinyint: 'TINYINT',
  bigint: 'BIGINT',
  decimal: 'DECIMAL',
  numeric: 'DECIMAL',
  double: 'DOUBLE',
  float: 'FLOAT',
  boolean: 'BOOLEAN',
  timestamp: 'TIMESTAMP',
  date: 'DATE',
};

const ANSI_ALIASES: Record<string, string> = {
  string: 'VARCHAR',
  varchar: 'VARCHAR',
  integer: 'INTEGER',
  int: 'INTEGER',
  smallint: 'SMALLINT',
  tinyint: 'SMALLINT',
  bigint: 'BIGINT',
  decimal: 'DECIMAL',
  numeric: 'DECIMAL',
  double: 'DOUBLE PRECISION',
  float: 'REAL',
  boolean: 'BOOLEAN',
  timestamp: 'TIMESTAMP',
  date: 'DATE',
};

/** Tipo Spark/Databricks para o DDL. Tipos desconhecidos passam em maiúsculas. */
export function typeToSpark(col: Column): string {
  const base = SPARK_ALIASES[col.type] ?? col.type.toUpperCase();
  // No Spark só DECIMAL leva tamanho; STRING/INT/TIMESTAMP/etc. não.
  if (base === 'DECIMAL' && col.args) return `DECIMAL(${col.args})`;
  return base;
}

/** Tipo ANSI (erwin reverse-engineer). string->VARCHAR(n); n = args ou 255. */
export function typeToAnsi(col: Column): string {
  const base = ANSI_ALIASES[col.type] ?? col.type.toUpperCase();
  if (base === 'VARCHAR') return `VARCHAR(${col.args || 255})`;
  if ((base === 'DECIMAL') && col.args) return `DECIMAL(${col.args})`;
  return base;
}
