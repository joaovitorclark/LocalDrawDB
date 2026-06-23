import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-pin-'));
  process.env.LOCALDRAWDB_DATA_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.LOCALDRAWDB_DATA_DIR;
  delete process.env.LOCALDRAWDB_PROJECT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function seedTwo() {
  const files = await import('../files.ts');
  const a = await files.createProject('Alpha'); // primeiro = ativo
  const b = await files.createProject('Beta');
  return { a, b, files };
}

describe('pin de projeto por processo', () => {
  it('getActiveSlug/getActiveId honram LOCALDRAWDB_PROJECT', async () => {
    const { b, files } = await seedTwo();
    process.env.LOCALDRAWDB_PROJECT = b.slug;
    expect(await files.getActiveSlug()).toBe(b.slug);
    expect(await files.getActiveId()).toBe(b.id);
  });

  it('sem pin, segue o activeId do registry (não-regressão)', async () => {
    const { a, files } = await seedTwo();
    expect(await files.getActiveId()).toBe(a.id);
    expect(await files.getActiveSlug()).toBe(a.slug);
  });

  it('pin com slug inexistente lança erro claro', async () => {
    const { files } = await seedTwo();
    process.env.LOCALDRAWDB_PROJECT = 'nao-existe';
    await expect(files.pinnedSlug()).rejects.toThrow(/nao-existe/);
  });

  it('setActiveProject não persiste sob pin', async () => {
    const { a, b, files } = await seedTwo();
    await files.setActiveProject(b.id);          // sem pin: ativo = Beta
    process.env.LOCALDRAWDB_PROJECT = a.slug;    // pin em Alpha
    await files.setActiveProject(a.id);          // no-op — mudaria para Alpha se o guard sumisse
    delete process.env.LOCALDRAWDB_PROJECT;
    expect(await files.getActiveId()).toBe(b.id); // continua Beta (pin não escreveu)
  });
});
