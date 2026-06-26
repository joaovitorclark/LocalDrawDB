import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectCli } from '../registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEW_SCRIPT = path.join(ROOT, 'scripts', 'newProject.mjs');

let tmpDir;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-new-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('createProjectCli', () => {
  it('cria o projeto no dataDir informado', async () => {
    createProjectCli('Meu Projeto', tmpDir);
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'));
    expect(reg.projects.some((p) => p.slug === 'meu-projeto')).toBe(true);
    const dirExists = await fs
      .stat(path.join(tmpDir, 'projects', 'meu-projeto'))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });
});

describe('npm run new (scripts/newProject.mjs)', () => {
  it('sem nome → exit 1', () => {
    const res = spawnSync(process.execPath, [NEW_SCRIPT], {
      env: { ...process.env, LOCALDRAWDB_DATA_DIR: tmpDir },
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
  });

  it('com nome → cria e exit 0', async () => {
    const res = spawnSync(process.execPath, [NEW_SCRIPT, 'Vendas RH'], {
      env: { ...process.env, LOCALDRAWDB_DATA_DIR: tmpDir },
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'));
    expect(reg.projects.some((p) => p.slug === 'vendas-rh')).toBe(true);
  });
});
