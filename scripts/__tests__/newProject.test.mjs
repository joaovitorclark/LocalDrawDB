import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectCli } from '../registry.mjs';

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
