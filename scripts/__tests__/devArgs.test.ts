import { describe, expect, it } from 'vitest';
import { parseDevArgs } from '../devArgs.mjs';

describe('parseDevArgs', () => {
  it('sem flags = shared', () => {
    expect(parseDevArgs([])).toEqual({ mode: 'shared', slugs: null, preview: false });
  });
  it('--project x', () => {
    expect(parseDevArgs(['--project', 'vendas'])).toEqual({ mode: 'project', slugs: ['vendas'], preview: false });
  });
  it('--projects x,y', () => {
    expect(parseDevArgs(['--projects', 'a, b'])).toEqual({ mode: 'project', slugs: ['a', 'b'], preview: false });
  });
  it('--all', () => {
    expect(parseDevArgs(['--all'])).toEqual({ mode: 'all', slugs: null, preview: false });
  });
  it('--preview combina com --all', () => {
    expect(parseDevArgs(['--all', '--preview'])).toEqual({ mode: 'all', slugs: null, preview: true });
  });
  it('--all + --project é erro', () => {
    expect(() => parseDevArgs(['--all', '--project', 'x'])).toThrow(/ambos/);
  });
  it('--projects sem valor é erro', () => {
    expect(() => parseDevArgs(['--projects'])).toThrow(/exige/);
  });
  it('flag desconhecida é erro', () => {
    expect(() => parseDevArgs(['--bogus'])).toThrow(/desconhecida/);
  });
});
