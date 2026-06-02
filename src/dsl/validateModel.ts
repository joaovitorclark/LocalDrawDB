import type { ParseResult } from './parse';

export type ModelIssue = {
  severity: 'error' | 'warn';
  message: string;
  tableId?: string;
};

/** Valida refs, PKs e linhagem após o parse do DBML. */
export function validateModel(parsed: ParseResult): ModelIssue[] {
  if (parsed.error) {
    return [{ severity: 'error', message: parsed.error }];
  }

  const issues: ModelIssue[] = [];
  const tableIds = new Set(parsed.tables.map((t) => t.id));
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
      });
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
