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
  it('slug posicional → project', () => {
    expect(parseDevArgs(['lakehouse'])).toEqual({ mode: 'project', slugs: ['lakehouse'], preview: false });
  });
  it('vários slugs posicionais', () => {
    expect(parseDevArgs(['vendas', 'rh'])).toEqual({ mode: 'project', slugs: ['vendas', 'rh'], preview: false });
  });
  it('posicional com vírgula', () => {
    expect(parseDevArgs(['vendas,rh'])).toEqual({ mode: 'project', slugs: ['vendas', 'rh'], preview: false });
  });
  it('posicional + --preview', () => {
    expect(parseDevArgs(['lakehouse', '--preview'])).toEqual({ mode: 'project', slugs: ['lakehouse'], preview: true });
  });
  it('--list → mode list', () => {
    expect(parseDevArgs(['--list'])).toEqual({ mode: 'list', slugs: null, preview: false });
  });
  it('--all + slug posicional é erro', () => {
    expect(() => parseDevArgs(['--all', 'vendas'])).toThrow(/ambos/);
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

const REG3 = {
  projects: [
    { slug: 'exemplo-lakehouse-medallion' },
    { slug: 'exemplo-rh-pessoas' },
    { slug: 'exemplo-vendas-e-commerce' },
  ],
};

describe('resolveSlugs — match por substring', () => {
  it('resolve por substring única', () => {
    expect(resolveSlugs(parseDevArgs(['lakehouse']), REG3)).toEqual(['exemplo-lakehouse-medallion']);
  });
  it('substring ambígua lança listando candidatos', () => {
    expect(() => resolveSlugs(parseDevArgs(['exemplo']), REG3)).toThrow(/ambíguo/);
  });
  it('substring inexistente lança listando disponíveis', () => {
    expect(() => resolveSlugs(parseDevArgs(['zzz']), REG3)).toThrow(/Disponíveis/);
  });
  it('match exato tem prioridade sobre substring', () => {
    const reg = { projects: [{ slug: 'rh' }, { slug: 'rh-pessoas' }] };
    expect(resolveSlugs(parseDevArgs(['rh']), reg)).toEqual(['rh']);
  });
  it('list → null', () => {
    expect(resolveSlugs(parseDevArgs(['--list']), REG3)).toBeNull();
  });
});
