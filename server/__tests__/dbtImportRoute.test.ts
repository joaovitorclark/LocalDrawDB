// F3 — integração: importar artefatos dbt (schema.yml) do input dir de um projeto.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-dbt-import-'));
  process.env.LOCALDRAWDB_DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.LOCALDRAWDB_DATA_DIR;
  vi.resetModules();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const SCHEMA_YML = `version: 2
models:
  - name: pedido
    description: Pedidos limpos
    config:
      materialized: incremental
      tags: [vendas]
    columns:
      - name: id
        data_tests: [unique, not_null]
      - name: status
        data_tests:
          - accepted_values: { values: [ativo, cancelado] }
`;

describe('POST /api/projects/:id/import — dbt', () => {
  it('importa schema.yml do input dir e gera DBML com metadados dbt', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerRoutes } = await import('../routes.ts');
    const { projectInputDir } = await import('../files.ts');
    const app = Fastify();
    await registerRoutes(app);

    // Descobre o projeto default e escreve o schema.yml no input dir dele.
    const list = (await app.inject({ method: 'GET', url: '/api/projects' })).json() as {
      activeId: string;
      projects: { id: string; slug: string }[];
    };
    const proj = list.projects[0];
    await fs.writeFile(path.join(projectInputDir(proj.slug), 'schema.yml'), SCHEMA_YML);

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${proj.id}/import`,
      payload: { dbml: '' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { dbml: string; imported: string[] };
    expect(body.dbml).toContain('pedido');
    expect(body.dbml).toContain('materialization: incremental');
    expect(body.imported.join(' ')).toMatch(/schema\.yml/);
  });
});
