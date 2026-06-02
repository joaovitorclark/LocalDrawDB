import { describe, expect, it } from 'vitest';
import { parseDbml } from '../parse';
import { validateModel } from '../validateModel';

describe('validateModel', () => {
  it('detecta ref com coluna inexistente', () => {
    const m = parseDbml(`
Table a {
  id bigint [pk]
}
Table b {
  id bigint [pk]
}
Ref: b.x > a.id
`);
    const issues = validateModel(m);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('x'))).toBe(true);
  });

  it('avisa tabela sem PK', () => {
    const m = parseDbml(`Table orphan {\n  nome string\n}`);
    expect(m.tables[0]?.columns.every((c) => !c.pk)).toBe(true);
    expect(validateModel(m).some((i) => i.severity === 'warn' && i.message.includes('PK'))).toBe(true);
  });
});
