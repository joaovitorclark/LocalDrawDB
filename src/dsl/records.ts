// Mini-parser de blocos `Records` do DBML (o @dbml/core não os suporta).
// Extrai cabeçalho `records tabela(col1, col2) { ... }` e as linhas de dados.

export type ParsedRecords = {
  table: string;
  columns: string[];
  rows: string[][];
  note?: string;
  raw: string;
};

/** Divide uma linha CSV respeitando aspas '...' e "..." (vírgulas internas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Faz parse de um bloco `records`. Tolerante: nunca lança; linha inválida é pulada. */
export function parseRecords(block: string): ParsedRecords | null {
  const headerMatch = /records\s+("?[^"\s(]+"?)\s*(?:\(([^)]*)\))?\s*\{/i.exec(block);
  if (!headerMatch) return null;
  const table = headerMatch[1].replace(/"/g, '');
  const columns = headerMatch[2]
    ? headerMatch[2].split(',').map((c) => c.trim()).filter(Boolean)
    : [];

  const body = block.slice(headerMatch.index + headerMatch[0].length);
  const end = body.lastIndexOf('}');
  const inner = end >= 0 ? body.slice(0, end) : body;

  const rows: string[][] = [];
  let note: string | undefined;
  for (const rawLine of inner.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const noteMatch = /^Note\s*:\s*'([^']*)'/i.exec(line);
    if (noteMatch) {
      note = noteMatch[1];
      continue;
    }
    rows.push(splitCsvLine(line));
  }

  return { table, columns, rows, note, raw: block };
}
