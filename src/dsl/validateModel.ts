import { lineOfColumn, lineOfGroupMember, lineOfRef, lineOfTable } from './lineLocate';
import type { Block } from './blocks';
import type { ParseResult } from './parse';

export type ModelIssue = {
  severity: 'error' | 'warn';
  message: string;
  tableId?: string;
  /** Linha 0-based no editor. */
  line?: number;
};

/** Valida refs, PKs e linhagem após o parse do DBML. */
export function validateModel(parsed: ParseResult, dbml?: string, blocks?: Block[]): ModelIssue[] {
  if (parsed.error) {
    return [{ severity: 'error', message: parsed.error, line: parsed.errorLine }];
  }

  const issues: ModelIssue[] = [];
  const tableIds = new Set(parsed.tables.map((t) => t.id));
  const hasTable = (id: string) =>
    tableIds.has(id) ||
    parsed.tables.some((t) => t.id === id || t.name === id.split('.').pop());

  for (const lg of parsed.layerGroups) {
    for (const member of lg.tables) {
      if (hasTable(member)) continue;
      issues.push({
        severity: 'error',
        message: `LayerGroup "${lg.name}": tabela inexistente "${member}"`,
        tableId: member,
        line: dbml ? lineOfGroupMember(dbml, member, blocks) : undefined,
      });
    }
  }
  const colsByTable = new Map(
    parsed.tables.map((t) => [t.id, new Set(t.columns.map((c) => c.name))] as const),
  );

  for (const t of parsed.tables) {
    const hasPk =
      t.columns.some((c) => c.pk) || (t.compositePks?.some((g) => g.length > 0) ?? false);
    if (!hasPk) {
      issues.push({
        severity: 'warn',
        message: `Tabela sem PK: ${t.id}`,
        tableId: t.id,
        line: dbml ? lineOfTable(dbml, t.id, blocks) : undefined,
      });
    }
    for (const group of t.compositePks ?? []) {
      for (const col of group) {
        if (!colsByTable.get(t.id)?.has(col)) {
          issues.push({
            severity: 'error',
            message: `PK composta: coluna "${col}" não existe em ${t.id}`,
            tableId: t.id,
            line: dbml ? lineOfTable(dbml, t.id, blocks) : undefined,
          });
        }
      }
    }
  }

  for (const r of parsed.refs) {
    if (!tableIds.has(r.source)) {
      issues.push({
        severity: 'error',
        message: `Ref origem inexistente: ${r.source}`,
        tableId: r.source,
      });
    } else if (!colsByTable.get(r.source)?.has(r.fromCol)) {
      issues.push({
        severity: 'error',
        message: `Coluna "${r.fromCol}" não existe em ${r.source}`,
        tableId: r.source,
        line: dbml ? lineOfRef(dbml, r.source, r.fromCol, blocks) : undefined,
      });
    }
    if (!tableIds.has(r.target)) {
      issues.push({
        severity: 'error',
        message: `Ref destino inexistente: ${r.target}`,
        tableId: r.target,
      });
    } else if (!colsByTable.get(r.target)?.has(r.toCol)) {
      issues.push({
        severity: 'error',
        message: `Coluna "${r.toCol}" não existe em ${r.target}`,
        tableId: r.target,
        line: dbml ? lineOfRef(dbml, r.target, r.toCol, blocks) : undefined,
      });
    }
  }

  for (const f of parsed.lineageFields ?? []) {
    if (!tableIds.has(f.targetTable)) {
      issues.push({
        severity: 'error',
        message: `Linhagem campo: tabela destino inexistente "${f.targetTable}"`,
        tableId: f.targetTable,
      });
    } else if (!colsByTable.get(f.targetTable)?.has(f.targetColumn)) {
      issues.push({
        severity: 'error',
        message: `Linhagem campo: coluna "${f.targetColumn}" não existe em ${f.targetTable}`,
        tableId: f.targetTable,
        line: dbml ? lineOfColumn(dbml, f.targetTable, f.targetColumn, blocks) : undefined,
      });
    }
    if (!tableIds.has(f.sourceTable)) {
      issues.push({
        severity: 'error',
        message: `Linhagem campo: tabela origem inexistente "${f.sourceTable}"`,
        tableId: f.sourceTable,
      });
    } else if (!colsByTable.get(f.sourceTable)?.has(f.sourceColumn)) {
      issues.push({
        severity: 'error',
        message: `Linhagem campo: coluna "${f.sourceColumn}" não existe em ${f.sourceTable}`,
        tableId: f.sourceTable,
        line: dbml ? lineOfColumn(dbml, f.sourceTable, f.sourceColumn, blocks) : undefined,
      });
    }
  }

  for (const entry of parsed.lineage) {
    if (!tableIds.has(entry.target)) {
      issues.push({
        severity: 'error',
        message: `Linhagem: destino inexistente "${entry.target}"`,
        tableId: entry.target,
      });
    }
    for (const src of entry.sources) {
      if (!tableIds.has(src)) {
        issues.push({
          severity: 'error',
          message: `Linhagem: origem inexistente "${src}" → ${entry.target}`,
          tableId: src,
        });
      } else if (src === entry.target) {
        issues.push({
          severity: 'warn',
          message: `Linhagem: self-loop em ${entry.target}`,
          tableId: entry.target,
        });
      }
    }
  }

  return issues;
}
