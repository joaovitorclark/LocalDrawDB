// Import de arquivos .sql (CREATE TABLE estilo Spark/Hive) -> modelo canônico.
// node-sql-parser (dialeto hive) não entende cláusulas Spark de tabela (USING,
// PARTITIONED BY, TBLPROPERTIES, LOCATION, ...), então pré-processamos o texto.
import { createRequire } from 'node:module';
import { parseTypeName } from './model.ts';
import type { Column, Model, Table } from './model.ts';

// node-sql-parser é CommonJS e não expõe export nomeado sob ESM; carregamos via require.
const require = createRequire(import.meta.url);
const { Parser } = require('node-sql-parser') as { Parser: new () => { astify: Function } };

const sqlParser = new Parser();

/** Divide um script em statements por ';' (ignorando ';' triviais). */
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Isola `CREATE TABLE <nome> ( ... )` removendo o que vier depois do bloco de
 * colunas (cláusulas Spark de tabela). Retorna um SQL limpo ou null.
 */
function sanitizeCreateTable(stmt: string): { schema?: string; name: string; body: string } | null {
  const cleaned = stmt.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  const head = /create\s+(?:external\s+|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_."]+)\s*\(/i.exec(
    cleaned,
  );
  if (!head) return null;

  // Varre parênteses balanceados a partir do '(' que abre as colunas.
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
  const body = cleaned.slice(open, close + 1); // inclui os parênteses

  return { schema, name, body };
}

/** Divide o corpo de colunas por vírgulas top-level (respeita parênteses). */
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

/**
 * Fallback baseado em regex (aceita QUALQUER tipo) para quando o node-sql-parser
 * falha — ex.: tipos como VARBINARY/BINARY fora da lista suportada por ele.
 */
function parseColumnsFallback(body: string): Column[] {
  const inner = body.trim().replace(/^\(/, '').replace(/\)$/, '');
  const pk = new Set<string>();
  const columns: Column[] = [];

  for (const part of splitTopLevel(inner)) {
    const pkm = /^primary\s+key\s*\(([^)]*)\)/i.exec(part);
    if (pkm) {
      pkm[1].split(',').forEach((c) => pk.add(c.replace(/[`"\s]/g, '')));
      continue;
    }
    if (/^(constraint|foreign\s+key|unique|key|index)\b/i.test(part)) continue;

    const m = /^([`"]?[A-Za-z_][\w]*[`"]?)\s+(.+)$/.exec(part);
    if (!m) continue;
    const name = m[1].replace(/[`"]/g, '');
    const rest = m[2];
    const typeMatch = /^([A-Za-z0-9_]+(?:\s*\([^)]*\))?)/.exec(rest);
    const { base, args } = parseTypeName(typeMatch ? typeMatch[1] : rest);
    columns.push({
      name,
      type: base,
      args,
      nullable: /\bnot\s+null\b/i.test(rest) ? false : true,
    });
  }

  for (const c of columns) if (pk.has(c.name)) {
    c.pk = true;
    c.nullable = false;
  }
  return columns;
}

/** Converte um único statement CREATE TABLE em uma Table (ou null). */
export function createTableToTable(stmt: string): Table | null {
  const san = sanitizeCreateTable(stmt);
  if (!san) return null;

  let columns: Column[] = [];
  try {
    const ast = sqlParser.astify(`CREATE TABLE ${san.name} ${san.body}`, { database: 'hive' });
    const node = Array.isArray(ast) ? ast[0] : ast;
    const defs: any[] = node.create_definitions ?? [];

    const pkCols = new Set<string>();
    for (const d of defs) {
      if (d.resource === 'constraint' && d.constraint_type === 'primary key') {
        for (const c of d.definition ?? []) pkCols.add(c.column);
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
    // tipos não suportados pelo node-sql-parser -> fallback abaixo
  }

  // Fallback robusto quando o parser falhou ou não extraiu colunas.
  if (!columns.length) columns = parseColumnsFallback(san.body);

  if (!columns.length) return null;
  return { name: san.name, schema: san.schema, columns };
}

/** Faz parse de um script .sql inteiro em uma lista de tabelas. */
export function sqlToTables(sql: string): Table[] {
  const tables: Table[] = [];
  for (const stmt of splitStatements(sql)) {
    if (!/create\s+(?:external\s+|temporary\s+)?table/i.test(stmt)) continue;
    const t = createTableToTable(stmt);
    if (t) tables.push(t);
  }
  return tables;
}

/** Mescla tabelas importadas em um modelo (substitui por nome qualificado). */
export function mergeTables(model: Model, incoming: Table[]): Model {
  const key = (t: Table) => `${t.schema ?? ''}.${t.name}`.toLowerCase();
  const byKey = new Map(model.tables.map((t) => [key(t), t] as const));
  for (const t of incoming) byKey.set(key(t), t);
  return { tables: [...byKey.values()], refs: model.refs };
}
