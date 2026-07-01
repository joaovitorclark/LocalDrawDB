import { describe, expect, it } from 'vitest';
import { quoteDbmlNote, sanitizeDbmlNoteText } from '../dbmlNotes';
import { setTableOrRecordsNote } from '../edit';
import { parseDbml } from '../parse';

describe('Note em qualquer lugar do bloco Table (#10)', () => {
  it('aceita Note: no meio das colunas (sem erro, note reconhecida)', () => {
    const src = `Table t {
  id int [pk]
  Note: 'no meio'
  nome string
}`;
    const r = parseDbml(src);
    expect(r.error).toBeUndefined();
    expect(r.tables[0]?.note).toBe('no meio');
    expect(r.tables[0]?.columns.map((c) => c.name)).toEqual(['id', 'nome']);
  });

  it('ainda aceita Note: no fim', () => {
    const r = parseDbml("Table t {\n  id int\n  Note: 'no fim'\n}");
    expect(r.error).toBeUndefined();
    expect(r.tables[0]?.note).toBe('no fim');
  });
});

describe('dbmlNotes', () => {
  it('escapa aspas simples', () => {
    expect(quoteDbmlNote("it's fine")).toBe("'it\\'s fine'");
  });

  it('escapa backslash e normaliza newline', () => {
    expect(sanitizeDbmlNoteText('a\\b\nc')).toBe('a\\\\b c');
    expect(quoteDbmlNote('a\\b\nc')).toBe("'a\\\\b c'");
  });

  it('preserva texto com -- inline (dentro de aspas DBML)', () => {
    expect(quoteDbmlNote('codigo -- interno')).toBe("'codigo -- interno'");
  });

  it('preserva ponto-e-vírgula no texto', () => {
    expect(quoteDbmlNote('valor; interno')).toBe("'valor; interno'");
  });
});

describe('setTableOrRecordsNote — preserva texto com espaços', () => {
  it('grava nota multi-palavra na Table', () => {
    const src = 'Table clientes {\n  id int\n}';
    const out = setTableOrRecordsNote(src, 'clientes', 'dimensão de clientes');
    expect(out).toContain("Note: 'dimensão de clientes'");
  });
});
