import type { ParsedFieldLineage, TableView } from './dsl/parse';

/** Conta colunas em tabelas silver/prata sem mapeamento L2 no modelo. */
export function countSilverColumnsWithoutL2(
  tables: TableView[],
  lineageFields: ParsedFieldLineage[],
): number {
  const mapped = new Set(
    lineageFields.map((f) => `${f.targetTable}.${f.targetColumn}`.toLowerCase()),
  );
  let count = 0;
  for (const t of tables) {
    const isSilver = t.layer === 'silver' || t.id.startsWith('silver.');
    if (!isSilver) continue;
    for (const c of t.columns) {
      if (!mapped.has(`${t.id}.${c.name}`.toLowerCase())) count++;
    }
  }
  return count;
}

export function exportInputL2Warning(
  tables: TableView[],
  lineageFields: ParsedFieldLineage[],
): string | null {
  if (!lineageFields.length) {
    return 'Export sem @map: modelo sem LineageFields. Edite Mapeamentos L2 ou importe SQL com @map.';
  }
  const missing = countSilverColumnsWithoutL2(tables, lineageFields);
  if (missing === 0) return null;
  return `Export sem @map: ${missing} coluna(s) silver sem LineageFields. Edite Mapeamentos L2 ou importe SQL com @map.`;
}
