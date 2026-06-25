// Testes do helper de registry do launcher (scripts/registry.mjs).
// Garante que projects.json é criado quando ausente (instalação limpa),
// reusando a migração canônica de server/files.ts.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRegistry } from '../registry.mjs';

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-reg-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadRegistry — bootstrap quando ausente', () => {
  it('cria projects.json com um projeto default quando o arquivo não existe', async () => {
    const registry = loadRegistry(tmpDir);

    // O arquivo passou a existir no disco.
    const raw = await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8');
    const onDisk = JSON.parse(raw);
    expect(onDisk.projects).toHaveLength(1);
    expect(onDisk.activeId).toBeTruthy();

    // O retorno reflete o conteúdo criado.
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].slug).toBe('default');
  });
});

describe('loadRegistry — registry apagado com projetos no disco', () => {
  it('reconstrói projects.json mapeando as pastas de projects/', async () => {
    // Cenário do usuário: projects.json apagado, mas data/projects/ tem projetos.
    await fs.mkdir(path.join(tmpDir, 'projects', 'vendas'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'projects', 'rh'), { recursive: true });

    const registry = loadRegistry(tmpDir);

    expect(registry.projects.map((p) => p.slug).sort()).toEqual(['rh', 'vendas']);
    // Arquivo recriado no disco.
    const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'));
    expect(onDisk.projects).toHaveLength(2);
  });
});

describe('loadRegistry — mapeia pasta criada manualmente', () => {
  it('inclui no registry pasta criada à mão quando o registry já existe', async () => {
    // Bootstrap do registry (cria projeto "default").
    loadRegistry(tmpDir);

    // Cria pasta manualmente, sem passar pelo createProject.
    await fs.mkdir(path.join(tmpDir, 'projects', 'manual-dir'), { recursive: true });

    // Segunda chamada deve sincronizar e mapear a nova pasta.
    const registry = loadRegistry(tmpDir);

    expect(registry.projects.map((p) => p.slug)).toContain('manual-dir');
  });
});

describe('loadRegistry — registry existente', () => {
  it('lê o registry existente sem alterá-lo', async () => {
    const existing = {
      activeId: 'abc123',
      projects: [{ id: 'abc123', name: 'X', slug: 'x', createdAt: 'now', updatedAt: 'now' }],
    };
    await fs.writeFile(path.join(tmpDir, 'projects.json'), JSON.stringify(existing), 'utf8');

    const registry = loadRegistry(tmpDir);
    expect(registry).toEqual(existing);
  });
});
