import { describe, expect, it } from 'vitest';
import { parseDbml } from '../../dsl/parse';
import { autolayoutPositions } from '../autolayout';

describe('autolayoutPositions', () => {
  it('posiciona todas as tabelas', () => {
    const parsed = parseDbml(`
Table loja.a {
  id bigint [pk]
}
Table loja.b {
  id bigint [pk]
}
Ref: loja.b.id > loja.a.id
`);
    const pos = autolayoutPositions(parsed);
    expect(pos['loja.a']).toBeDefined();
    expect(pos['loja.b']).toBeDefined();
    expect(pos['loja.a'].x).not.toBe(pos['loja.b'].x);
  });
});
