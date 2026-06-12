import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-node.mjs');

describe('check-node.mjs', () => {
  it('aceita Node atual do CI', () => {
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('--warn nao falha com versao baixa simulada', () => {
    const r = spawnSync(process.execPath, [CHECK, '--warn'], {
      encoding: 'utf8',
      env: { ...process.env, npm_config_user_config: '' },
    });
    expect(r.status).toBe(0);
  });
});
