// Strip de blocos custom do DBML antes do @dbml/core (compartilhado frontend + servidor).
import { splitDbmlBlocks } from './blocks';
import { parseRecords, type ParsedRecords } from './records';

// ---- Tipos para o bloco Dbt { } ----

export type ParsedDbtColumn = {
  /** Testes accepted_values serializados no bloco (unique/not_null são derivados do DBML nativo). */
  acceptedValues?: string[];
};

export type ParsedDbtTable = {
  tableName: string; // qualifiedName (schema.tabela ou tabela)
  resourceType?: 'model' | 'source' | 'seed' | 'snapshot';
  materialization?: 'table' | 'view' | 'incremental' | 'ephemeral';
  tags?: string[];
  meta?: Record<string, unknown>;
  columns?: Record<string, ParsedDbtColumn>;
};

/** Faz parse de um bloco `Dbt { ... }`. */
export function parseDbtBlock(block: string): ParsedDbtTable[] {
  const h = /Dbt\s*\{/i.exec(block);
  if (!h) return [];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const lines = inner.split('\n').map((l) => l.trimEnd());
  const tables: ParsedDbtTable[] = [];
  let current: ParsedDbtTable | null = null;
  let inMeta = false;
  let metaDepth = 0;
  let metaLines: string[] = [];
  let inColumns = false;
  let currentColName: string | null = null;
  let colAccepted: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    // Rastreia bloco meta { } (pode ter profundidade arbitrária)
    if (inMeta) {
      metaDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (metaDepth <= 0) {
        // Fim do meta: faz parse simples de chave: valor
        inMeta = false;
        if (current) {
          current.meta = parseSimpleKv(metaLines);
        }
        metaLines = [];
        metaDepth = 0;
      } else {
        metaLines.push(line);
      }
      continue;
    }

    // Início de um novo sub-bloco de tabela: "table tableName {"
    const tableHeader = /^table\s+(\S+)\s*\{/i.exec(line);
    if (tableHeader) {
      // Fecha coluna anterior se aberta
      if (current && currentColName && colAccepted !== null) {
        current.columns ??= {};
        current.columns[currentColName] = { acceptedValues: colAccepted };
        currentColName = null;
        colAccepted = null;
      }
      inColumns = false;
      current = { tableName: tableHeader[1] };
      tables.push(current);
      continue;
    }

    if (!current) continue;

    // Fim de um sub-bloco de tabela "}"
    if (line === '}') {
      if (inColumns && currentColName && colAccepted !== null) {
        current.columns ??= {};
        current.columns[currentColName] = { acceptedValues: colAccepted };
        currentColName = null;
        colAccepted = null;
      }
      inColumns = false;
      current = null;
      continue;
    }

    // Dentro de um sub-bloco de colunas: "columns {"
    const colsHeader = /^columns\s*\{/i.exec(line);
    if (colsHeader) {
      // Fecha coluna anterior
      if (currentColName && colAccepted !== null) {
        current.columns ??= {};
        current.columns[currentColName] = { acceptedValues: colAccepted };
        currentColName = null;
        colAccepted = null;
      }
      inColumns = true;
      continue;
    }

    if (inColumns) {
      // Fim do bloco de colunas
      if (line === '}') {
        if (currentColName && colAccepted !== null) {
          current.columns ??= {};
          current.columns[currentColName] = { acceptedValues: colAccepted };
          currentColName = null;
          colAccepted = null;
        }
        inColumns = false;
        continue;
      }

      // Início de uma coluna: "colName {"
      const colHeader = /^(\S+)\s*\{/i.exec(line);
      if (colHeader) {
        // Fecha coluna anterior
        if (currentColName && colAccepted !== null) {
          current.columns ??= {};
          current.columns[currentColName] = { acceptedValues: colAccepted };
        }
        currentColName = colHeader[1];
        colAccepted = null;
        continue;
      }

      // Fim de coluna
      if (line === '}' && currentColName) {
        current.columns ??= {};
        current.columns[currentColName] = { acceptedValues: colAccepted ?? [] };
        currentColName = null;
        colAccepted = null;
        continue;
      }

      // accepted_values dentro de coluna
      if (currentColName) {
        const av = /^accepted_values\s*:\s*\[([^\]]*)\]/i.exec(line);
        if (av) {
          colAccepted = av[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')).filter(Boolean);
          continue;
        }
      }
      continue;
    }

    // Propriedades da tabela
    const resourceType = /^resource_type\s*:\s*(\S+)/i.exec(line);
    if (resourceType) {
      const rt = resourceType[1] as 'model' | 'source' | 'seed' | 'snapshot';
      current.resourceType = rt;
      continue;
    }

    const materialization = /^materialization\s*:\s*(\S+)/i.exec(line);
    if (materialization) {
      current.materialization = materialization[1] as 'table' | 'view' | 'incremental' | 'ephemeral';
      continue;
    }

    const tags = /^tags\s*:\s*\[([^\]]*)\]/i.exec(line);
    if (tags) {
      current.tags = tags[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')).filter(Boolean);
      continue;
    }

    const meta = /^meta\s*\{/i.exec(line);
    if (meta) {
      inMeta = true;
      metaDepth = 1;
      metaLines = [];
      continue;
    }
  }

  return tables;
}

/** Parse simples de bloco de pares chave: valor (sem aninhamento). */
function parseSimpleKv(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of lines) {
    const m = /^\s*(\w+)\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    const key = m[1].trim();
    const rawVal = m[2].trim().replace(/^'|'$/g, '');
    // Tenta número
    if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
      result[key] = Number(rawVal);
    } else if (rawVal === 'true') {
      result[key] = true;
    } else if (rawVal === 'false') {
      result[key] = false;
    } else {
      result[key] = rawVal;
    }
  }
  return result;
}

export type ParsedLayerGroup = { id: string; name: string; color?: string; tables: string[] };
export type ParsedLineage = { target: string; sources: string[] };
export type ParsedFieldLineage = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  note?: string;
  ref?: string;
};

/** Faz parse de um bloco `LayerGroup nome [color: #hex] { ... }`. */
export function parseLayerGroup(block: string): ParsedLayerGroup | null {
  const h = /LayerGroup\s+("?[^"\s[{]+"?)\s*(?:\[([^\]]*)\])?\s*\{/i.exec(block);
  if (!h) return null;
  const name = h[1].replace(/"/g, '');
  const color = /color\s*:\s*(#?[\w]+)/i.exec(h[2] || '')?.[1];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const tables = inner.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  return { id: name.toLowerCase(), name, color, tables };
}

/** Faz parse de um bloco `Lineage { target < source1, source2 }`. */
export function parseLineageBlock(block: string): ParsedLineage[] {
  const h = /Lineage\s*\{/i.exec(block);
  if (!h) return [];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const out: ParsedLineage[] = [];
  for (const rawLine of inner.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const m = /^([^\s<]+)\s*<\s*(.+)$/.exec(line);
    if (!m) continue;
    const target = m[1].trim();
    const sources = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    if (target && sources.length) out.push({ target, sources });
  }
  return out;
}

/** `schema.tabela.coluna` → { table, column }. */
export function splitTableColumn(qualified: string): { table: string; column: string } | null {
  const q = qualified.trim().replace(/"/g, '');
  const last = q.lastIndexOf('.');
  if (last <= 0) return null;
  const table = q.slice(0, last);
  const column = q.slice(last + 1);
  if (!table || !column) return null;
  return { table, column };
}

function parseFieldLineageSettings(bracket: string | undefined): { note?: string; ref?: string } {
  if (!bracket?.trim()) return {};
  const note = /note\s*:\s*'([^']*)'/i.exec(bracket)?.[1];
  const ref = /ref\s*:\s*'([^']*)'/i.exec(bracket)?.[1];
  return { note, ref };
}

/** Parse de `LineageFields { target.tbl.col < source.tbl.col [note: '...', ref: '...'] }`. */
export function parseLineageFieldsBlock(block: string): ParsedFieldLineage[] {
  const h = /LineageFields\s*\{/i.exec(block);
  if (!h) return [];
  const body = block.slice(h.index + h[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;
  const out: ParsedFieldLineage[] = [];
  for (const rawLine of inner.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const m = /^([^\s<]+)\s*<\s*([^\s\[]+)(?:\s*\[([^\]]*)\])?\s*$/.exec(line);
    if (!m) continue;
    const target = splitTableColumn(m[1].trim());
    const source = splitTableColumn(m[2].trim());
    if (!target || !source) continue;
    const meta = parseFieldLineageSettings(m[3]);
    out.push({
      targetTable: target.table,
      targetColumn: target.column,
      sourceTable: source.table,
      sourceColumn: source.column,
      ...meta,
    });
  }
  return out;
}

export type ParsedRolename = {
  child: { table: string; column: string };
  parent: { table: string; column: string };
};

export function parseRolenamesBlock(block: string): ParsedRolename[] {
  const out: ParsedRolename[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || /^Rolenames\s*\{/i.test(line) || line === '}') continue;
    const m = /^([^\s<]+)\s*<\s*([^\s]+)/.exec(line);
    if (!m) continue;
    const c = splitTableColumn(m[1]);
    const p = splitTableColumn(m[2]);
    if (c && p) out.push({ child: c, parent: p });
  }
  return out;
}

const CUSTOM_TYPES = new Set(['records', 'layerGroup', 'lineage', 'lineageFields', 'dbt', 'rolenames']);

/** Remove blocos extras antes do @dbml/core. */
export function cleanDbml(src: string): string {
  const blocks = splitDbmlBlocks(src);
  const keep: string[] = [];
  for (const b of blocks) {
    if (!CUSTOM_TYPES.has(b.type) && b.type !== 'blank') keep.push(b.text);
  }
  return keep.join('\n');
}

/** Mapeia linha 0-based do buffer "clean" (sem blocos custom) → linha 0-based no editor. */
export type CleanLineMap = (cleanLine0: number) => number;

function buildCleanFromBlocks(
  blocks: ReturnType<typeof splitDbmlBlocks>,
): { clean: string; mapCleanLineToOriginal: CleanLineMap } {
  const keepTexts: string[] = [];
  const lineOrigins: number[] = [];
  for (const b of blocks) {
    if (CUSTOM_TYPES.has(b.type) || b.type === 'blank') continue;
    const start = b.lineStart ?? 0;
    const blines = b.text.split('\n');
    for (let i = 0; i < blines.length; i++) lineOrigins.push(start + i);
    keepTexts.push(b.text);
  }
  const mapCleanLineToOriginal = (cleanLine0: number) => lineOrigins[cleanLine0] ?? cleanLine0;
  return { clean: keepTexts.join('\n'), mapCleanLineToOriginal };
}

/** Remove blocos extras e extrai metadados custom (Records, LayerGroup, Lineage, Dbt, …). */
export function extractRecords(src: string): {
  clean: string;
  records: ParsedRecords[];
  layerGroups: ParsedLayerGroup[];
  lineage: ParsedLineage[];
  lineageFields: ParsedFieldLineage[];
  dbtTables: ParsedDbtTable[];
  rolenames: ParsedRolename[];
  mapCleanLineToOriginal: CleanLineMap;
} {
  const blocks = splitDbmlBlocks(src);
  const records: ParsedRecords[] = [];
  const layerGroups: ParsedLayerGroup[] = [];
  const lineage: ParsedLineage[] = [];
  const lineageFields: ParsedFieldLineage[] = [];
  const dbtTables: ParsedDbtTable[] = [];
  const rolenames: ParsedRolename[] = [];
  for (const b of blocks) {
    if (b.type === 'records') {
      const pr = parseRecords(b.text);
      if (pr) records.push(pr);
    } else if (b.type === 'layerGroup') {
      const lg = parseLayerGroup(b.text);
      if (lg) layerGroups.push(lg);
    } else if (b.type === 'lineage') {
      lineage.push(...parseLineageBlock(b.text));
    } else if (b.type === 'lineageFields') {
      lineageFields.push(...parseLineageFieldsBlock(b.text));
    } else if (b.type === 'dbt') {
      dbtTables.push(...parseDbtBlock(b.text));
    } else if (b.type === 'rolenames') {
      rolenames.push(...parseRolenamesBlock(b.text));
    }
  }
  const { clean, mapCleanLineToOriginal } = buildCleanFromBlocks(blocks);
  return { clean, records, layerGroups, lineage, lineageFields, dbtTables, rolenames, mapCleanLineToOriginal };
}
