/** Sanitiza texto de nota antes de embutir em string DBML entre aspas simples. */
export function sanitizeDbmlNoteText(note: string): string {
  return note
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/** Formata nota para DBML: `'texto escapado'`. */
export function quoteDbmlNote(note: string): string {
  return `'${sanitizeDbmlNoteText(note)}'`;
}
