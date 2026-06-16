import { describe, expect, it } from 'vitest';
import { quoteDbmlNote, sanitizeDbmlNoteText } from '../dbmlNotes';

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
