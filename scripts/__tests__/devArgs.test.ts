import { describe, expect, it } from 'vitest';
import { parseDevArgs, resolveSlugs } from '../devArgs.mjs';

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
  it('--projects seguido de outra flag é erro', () => {
    expect(() => parseDevArgs(['--projects', '--all'])).toThrow(/exige/);
  });
});

const REG = { projects: [{ slug: 'alpha' }, { slug: 'beta' }] };

describe('resolveSlugs', () => {
  it('shared → null', () => {
    expect(resolveSlugs(parseDevArgs([]), REG)).toBeNull();
  });
  it('all → todos os slugs', () => {
    expect(resolveSlugs(parseDevArgs(['--all']), REG)).toEqual(['alpha', 'beta']);
  });
  it('project existente', () => {
    expect(resolveSlugs(parseDevArgs(['--project', 'beta']), REG)).toEqual(['beta']);
  });
  it('project inexistente lança listando disponíveis', () => {
    expect(() => resolveSlugs(parseDevArgs(['--project', 'nope']), REG)).toThrow(/alpha, beta/);
  });
});
