// Mutações de texto do DBML ancoradas no bloco da tabela (via splitDbmlBlocks).
// Princípio: nomes de coluna são únicos numa tabela -> localização robusta por nome.
import { splitDbmlBlocks } from './blocks';
import { dbmlIdent } from './parse';

const stripQuotes = (s: string) => s.replace(/["`]/g, '').trim();

/** Casa o nome do bloco com um id possivelmente qualificado (schema.tabela). */
function tableMatches(blockName: string | undefined, target: string): boolean {
  if (!blockName) return false;
  const a = stripQuotes(blockName).toLowerCase();
  const b = stripQuotes(target).toLowerCase();
  if (a === b) return true;
  const lastA = a.split('.').pop()!;
  const lastB = b.split('.').pop()!;
  return lastA === lastB && (a.endsWith('.' + lastB) || b.endsWith('.' + lastA) || lastA === b || lastB === a);
}

/** Reconstrói o src aplicando `fn` ao texto do bloco da tabela alvo. */
function mutateTableBlock(src: string, table: string, fn: (blockText: string) => string): string {
  const blocks = splitDbmlBlocks(src);
  let found = false;
  const out = blocks.map((b) => {
    if (b.type === 'table' && tableMatches(b.name, table)) {
      found = true;
      return fn(b.text);
    }
    return b.text;
  });
  return found ? out.join('\n') : src;
}

/** Quebra uma linha de campo em { indent, name, rest (tipo+settings) }. */
function parseFieldLine(line: string): { indent: string; name: string; rest: string } | null {
  const m = /^(\s*)("?[A-Za-z_][\w]*"?|"[^"]+")\s+(.*)$/.exec(line);
  if (!m) return null;
  return { indent: m[1], name: stripQuotes(m[2]), rest: m[3] };
}

const isFieldLine = (line: string) => {
  const t = line.trim();
  if (!t || t.startsWith('//')) return false;
  if (/^Table\b/i.test(t) || t.startsWith('}') || t === '{') return false;
  if (/^(Note|indexes)\b/i.test(t)) return false;
  return /^("?[A-Za-z_][\w]*"?|"[^"]+")\s+\S/.test(t);
};

// ---- Settings de coluna ----

export type ColSettings = {
  pk?: boolean;
  notNull?: boolean;
  note?: string;
  default?: string;
  /** FK inline: `schema.tabela.coluna` */
  refTarget?: string | null;
};

/** Reescreve o sufixo [..] de uma coluna, preservando settings não gerenciados. */
function applySettings(rest: string, s: ColSettings): string {
  const bracket = /\[([^\]]*)\]\s*$/.exec(rest);
  const typePart = bracket ? rest.slice(0, bracket.index).trim() : rest.trim();
  const existing = bracket
    ? bracket[1].split(',').map((x) => x.trim()).filter(Boolean)
    : [];

  // Remove os tokens gerenciados; mantém o resto (unique, increment, ...).
  const managed = /^(pk|primary key|not null|note\s*:|default\s*:|ref\s*:)/i;
  const kept = existing.filter((tok) => !managed.test(tok));

  const tokens = [...kept];
  if (s.pk) tokens.push('pk');
  if (s.notNull) tokens.push('not null');
  if (s.note) tokens.push(`note: '${s.note.replace(/'/g, "\\'")}'`);
  if (s.default !== undefined && s.default !== '') tokens.push(`default: ${s.default}`);
  if (s.refTarget) tokens.push(`ref: > ${s.refTarget}`);

  return tokens.length ? `${typePart} [${tokens.join(', ')}]` : typePart;
}

/** Lê os settings gerenciados atuais de uma coluna (para popular o painel). */
export function getColumnSettings(src: string, table: string, column: string): ColSettings {
  const result: ColSettings = {};
  mutateTableBlock(src, table, (block) => {
    for (const line of block.split('\n')) {
      if (!isFieldLine(line)) continue;
      const f = parseFieldLine(line);
      if (!f || f.name !== stripQuotes(column)) continue;
      const bracket = /\[([^\]]*)\]\s*$/.exec(f.rest);
      const toks = bracket ? bracket[1].split(',').map((x) => x.trim()) : [];
      result.pk = toks.some((t) => /^(pk|primary key)$/i.test(t));
      result.notNull = toks.some((t) => /^not null$/i.test(t));
      result.note = /note\s*:\s*'([^']*)'/i.exec(bracket?.[1] ?? '')?.[1];
      result.default = /default\s*:\s*([^,]+)/i.exec(bracket?.[1] ?? '')?.[1]?.trim();
      const refM = /ref\s*:\s*>\s*([^\s,]+)/i.exec(bracket?.[1] ?? '');
      if (refM) result.refTarget = refM[1];
    }
    return block;
  });
  return result;
}

export function setColumnSetting(
  src: string,
  table: string,
  column: string,
  settings: ColSettings,
): string {
  return mutateTableBlock(src, table, (block) =>
    block
      .split('\n')
      .map((line) => {
        if (!isFieldLine(line)) return line;
        const f = parseFieldLine(line);
        if (!f || f.name !== stripQuotes(column)) return line;
        return `${f.indent}${f.name} ${applySettings(f.rest, settings)}`;
      })
      .join('\n'),
  );
}

export function renameColumn(src: string, table: string, oldName: string, newName: string): string {
  return mutateTableBlock(src, table, (block) =>
    block
      .split('\n')
      .map((line) => {
        if (!isFieldLine(line)) return line;
        const f = parseFieldLine(line);
        if (!f || f.name !== stripQuotes(oldName)) return line;
        return `${f.indent}${dbmlIdent(newName)} ${f.rest}`;
      })
      .join('\n'),
  );
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Renomeia uma tabela em todo o documento: cabeçalho, refs e membros de TableGroup.
 * Casa o nome qualificado como token (não pega prefixos de nomes maiores).
 */
export function renameTable(src: string, tableId: string, newName: string): string {
  const old = stripQuotes(tableId);
  if (!old || !newName.trim() || old === stripQuotes(newName)) return src;
  const re = new RegExp(`(?<![\\w.])${escapeRegex(old)}(?![\\w])`, 'g');
  return src.replace(re, dbmlIdent(newName.trim()));
}

export function addColumn(src: string, table: string, name: string, type = 'string'): string {
  return mutateTableBlock(src, table, (block) => {
    const close = block.lastIndexOf('}');
    if (close < 0) return block;
    const indent = '  ';
    const insertion = `${indent}${dbmlIdent(name)} ${type}\n`;
    return block.slice(0, close) + insertion + block.slice(close);
  });
}

// ---- Refs (drag-to-create) ----

export function refExists(src: string, fromTbl: string, fromCol: string, toTbl: string, toCol: string): boolean {
  const a = `${stripQuotes(fromTbl)}.${fromCol}`;
  const b = `${stripQuotes(toTbl)}.${toCol}`;
  for (const block of splitDbmlBlocks(src)) {
    if (block.type !== 'ref') continue;
    const text = block.text.replace(/["`]/g, '');
    if (text.includes(a) && text.includes(b)) return true;
  }
  return false;
}

// ---- Camadas (LayerGroup no DBML) ----

const lgName = (block: string) => /LayerGroup\s+("?[^"\s[{]+"?)/i.exec(block)?.[1]?.replace(/["`]/g, '');
const lgRemoveMember = (block: string, tableId: string) =>
  block
    .split('\n')
    .filter((l) => l.trim().replace(/["`]/g, '') !== stripQuotes(tableId))
    .join('\n');
function lgAddMember(block: string, tableId: string): string {
  if (block.includes(`\n  ${tableId}`) || new RegExp(`\\n\\s*${escapeRegex(tableId)}\\s*\\n`).test(block)) return block;
  const close = block.lastIndexOf('}');
  if (close < 0) return block;
  return block.slice(0, close) + `  ${dbmlIdent(tableId)}\n` + block.slice(close);
}

/** Atribui (ou remove) a camada de uma tabela mutando os blocos `LayerGroup` do DBML. */
export function setTableLayer(src: string, tableId: string, layerId: string | null, color?: string): string {
  let found = false;
  const out = splitDbmlBlocks(src).map((b) => {
    if (b.type !== 'layerGroup') return b.text;
    let text = lgRemoveMember(b.text, tableId); // tabela fica em no máximo 1 camada
    if (layerId && lgName(b.text)?.toLowerCase() === layerId.toLowerCase()) {
      text = lgAddMember(text, tableId);
      found = true;
    }
    return text;
  });
  let result = out.join('\n');
  if (layerId && !found) {
    const colorPart = color ? ` [color: ${color}]` : '';
    result = `${result.replace(/\n+$/, '')}\n\nLayerGroup ${layerId}${colorPart} {\n  ${dbmlIdent(tableId)}\n}\n`;
  }
  return result.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Cria um LayerGroup vazio (camada nova) no DBML. */
export function addLayerGroup(src: string, name: string, color: string): string {
  const id = name.toLowerCase().replace(/\s+/g, '_');
  if (splitDbmlBlocks(src).some((b) => b.type === 'layerGroup' && lgName(b.text)?.toLowerCase() === id)) return src;
  return `${src.replace(/\n+$/, '')}\n\nLayerGroup ${id} [color: ${color}] {\n}\n`;
}

// ---- Lineage (bloco Lineage no DBML) ----

/** Adiciona um par source→target ao bloco Lineage (cria o bloco se não existir). */
export function addLineageEntry(src: string, source: string, target: string): string {
  const blocks = splitDbmlBlocks(src);
  const linBlock = blocks.find((b) => b.type === 'lineage');
  if (linBlock) {
    const lines = linBlock.text.split('\n');
    const existing = lines.find((l) => {
      const m = /^(\s*)([^\s<]+)\s*</.exec(l);
      return m && m[2].trim() === target;
    });
    if (existing) {
      if (existing.includes(source)) return src;
      const updated = existing.replace(/(<\s*.+)$/, `$1, ${source}`);
      const newText = linBlock.text.replace(existing, updated);
      return src.replace(linBlock.text, newText);
    }
    const close = linBlock.text.lastIndexOf('}');
    if (close >= 0) {
      const newText = linBlock.text.slice(0, close) + `  ${target} < ${source}\n` + linBlock.text.slice(close);
      return src.replace(linBlock.text, newText);
    }
  }
  return `${src.replace(/\n+$/, '')}\n\nLineage {\n  ${target} < ${source}\n}\n`;
}

/** Remove um par source→target do bloco Lineage. Remove a linha se ficar sem sources. */
export function removeLineageEntry(src: string, source: string, target: string): string {
  const blocks = splitDbmlBlocks(src);
  const linBlock = blocks.find((b) => b.type === 'lineage');
  if (!linBlock) return src;
  const updated = linBlock.text.split('\n').map((line) => {
    const m = /^(\s*)([^\s<]+)\s*<\s*(.+)$/.exec(line);
    if (!m || m[2].trim() !== target) return line;
    const sources = m[3].split(',').map((s) => s.trim()).filter((s) => s !== source);
    if (!sources.length) return null;
    return `${m[1]}${m[2]} < ${sources.join(', ')}`;
  }).filter((l): l is string => l !== null).join('\n');
  if (!/\S/.test(updated.replace(/Lineage\s*\{/i, '').replace('}', ''))) {
    return src.replace(linBlock.text, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  return src.replace(linBlock.text, updated);
}

/** Remove o(s) bloco(s) `Ref` que casam o par (qualquer direção). Não toca nos outros. */
export function removeRef(
  src: string,
  fromTbl: string,
  fromCol: string,
  toTbl: string,
  toCol: string,
): string {
  const a = `${stripQuotes(fromTbl)}.${fromCol}`;
  const b = `${stripQuotes(toTbl)}.${toCol}`;
  let removed = false;
  const kept = splitDbmlBlocks(src).filter((block) => {
    if (block.type !== 'ref') return true;
    const text = block.text.replace(/["`]/g, '');
    if (text.includes(a) && text.includes(b)) {
      removed = true;
      return false;
    }
    return true;
  });
  if (!removed) return src;
  return kept.map((b) => b.text).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Acrescenta `Ref: from.col > to.col`. Evita duplicata e self-loop na mesma coluna. */
export function appendRef(
  src: string,
  fromTbl: string,
  fromCol: string,
  toTbl: string,
  toCol: string,
  kind: '>' | '<' | '-' | '<>' = '>',
): string {
  if (fromTbl === toTbl && fromCol === toCol) return src;
  if (refExists(src, fromTbl, fromCol, toTbl, toCol)) return src;
  const line = `Ref: ${dbmlIdent(fromTbl)}.${fromCol} ${kind} ${dbmlIdent(toTbl)}.${toCol}`;
  const sep = src.endsWith('\n') ? '' : '\n';
  return `${src}${sep}${line}\n`;
}
