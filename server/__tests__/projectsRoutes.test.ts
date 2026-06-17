/**
 * Testes TDD para as rotas CRUD de projetos (F1).
 * Cobre GET/POST/PUT/PATCH/DELETE /api/projects e sub-rotas.
 *
 * Usa LOCALDRAWDB_DATA_DIR apontando para um tmpdir isolado por teste.
 * vi.resetModules() + import dinâmico garante que files.ts e routes.ts
 * leiam o env var correto em cada teste.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-projects-routes-'));
  process.env.LOCALDRAWDB_DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.LOCALDRAWDB_DATA_DIR;
  vi.resetModules();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function buildApp() {
  const { default: Fastify } = await import('fastify');
  const { registerRoutes } = await import('../routes.ts');
  const app = Fastify();
  await registerRoutes(app);
  return app;
}

// ──────────────────────────────────────────────────────────────
// GET /api/projects — lista projetos
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects', () => {
  it('retorna activeId e lista com o projeto default após migração', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { activeId: string; projects: unknown[] };
    expect(body.activeId).toBeTruthy();
    expect(body.projects).toHaveLength(1);
    expect((body.projects[0] as { name: string }).name).toBe('default');
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects — cria projeto
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects', () => {
  it('cria projeto e retorna 201 com os metadados', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Novo Projeto' },
    });
    await app.close();

    expect(res.statusCode).toBe(201);
    const meta = res.json() as { id: string; name: string; slug: string };
    expect(meta.name).toBe('Novo Projeto');
    expect(meta.slug).toBe('novo-projeto');
    expect(meta.id).toBeTruthy();
  });

  it('projeto criado aparece em GET /api/projects', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Aparece' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    const body = res.json() as { projects: { name: string }[] };
    expect(body.projects.some((p) => p.name === 'Aparece')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:id — carrega dbml + canvas de um projeto
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects/:id', () => {
  it('retorna dbml e canvas do projeto', async () => {
    const app = await buildApp();
    // Busca o projeto default
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string }[] };
    const id = projects[0].id;

    const res = await app.inject({ method: 'GET', url: `/api/projects/${id}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { dbml: string; canvas: unknown };
    expect(typeof body.dbml).toBe('string');
    expect(body.canvas).toBeDefined();
  });

  it('retorna 404 para id inexistente', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects/id-que-nao-existe' });
    await app.close();

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string };
    expect(body.error).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/projects/:id — salva dbml + canvas
// ──────────────────────────────────────────────────────────────
describe('PUT /api/projects/:id', () => {
  it('persiste dbml + canvas e pode ser lido de volta', async () => {
    const app = await buildApp();
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string }[] };
    const id = projects[0].id;

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/projects/${id}`,
      payload: { dbml: 'Table test { id int }', canvas: { zoom: 2 } },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toMatchObject({ ok: true });

    const getRes = await app.inject({ method: 'GET', url: `/api/projects/${id}` });
    await app.close();

    const body = getRes.json() as { dbml: string; canvas: { zoom: number } };
    expect(body.dbml).toBe('Table test { id int }');
    expect(body.canvas).toMatchObject({ zoom: 2 });
  });

  it('retorna 404 para id inexistente', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/projects/nao-existe',
      payload: { dbml: '', canvas: {} },
    });
    await app.close();

    expect(res.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// PATCH /api/projects/:id — renomeia projeto
// ──────────────────────────────────────────────────────────────
describe('PATCH /api/projects/:id', () => {
  it('renomeia o projeto e retorna ok', async () => {
    const app = await buildApp();
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string; name: string }[] };
    const id = projects[0].id;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}`,
      payload: { name: 'Renomeado' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toMatchObject({ ok: true });

    const afterRes = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    const after = afterRes.json() as { projects: { id: string; name: string }[] };
    expect(after.projects.find((p) => p.id === id)?.name).toBe('Renomeado');
  });

  it('retorna 404 para id inexistente', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/projects/nao-existe',
      payload: { name: 'X' },
    });
    await app.close();

    expect(res.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/projects/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/projects/:id', () => {
  it('deleta um projeto não-último e retorna ok', async () => {
    const app = await buildApp();
    // Cria segundo projeto para poder deletar o primeiro
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Segundo' },
    });
    const created = createRes.json() as { id: string };

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${created.id}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toMatchObject({ ok: true });

    const afterRes = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    const body = afterRes.json() as { projects: { id: string }[] };
    expect(body.projects.some((p) => p.id === created.id)).toBe(false);
  });

  it('retorna 409 ao tentar deletar o único projeto', async () => {
    const app = await buildApp();
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string }[] };
    const onlyId = projects[0].id;

    const res = await app.inject({ method: 'DELETE', url: `/api/projects/${onlyId}` });
    await app.close();

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('retorna 404 para id inexistente', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/projects/nao-existe' });
    await app.close();

    expect(res.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:id/duplicate
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects/:id/duplicate', () => {
  it('duplica projeto e retorna 201 com novo ProjectMeta', async () => {
    const app = await buildApp();
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string; slug: string }[] };
    const { id, slug } = projects[0];

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/duplicate`,
      payload: { name: 'Cópia Customizada' },
    });
    expect(res.statusCode).toBe(201);
    const copy = res.json() as { id: string; slug: string; name: string };
    expect(copy.id).not.toBe(id);
    expect(copy.slug).not.toBe(slug);
    expect(copy.name).toBe('Cópia Customizada');

    const afterRes = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    const body = afterRes.json() as { projects: { id: string }[] };
    expect(body.projects.some((p) => p.id === copy.id)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:id/activate
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects/:id/activate', () => {
  it('muda projeto ativo e reflete em GET /api/project (rota legada)', async () => {
    const app = await buildApp();
    // Cria um segundo projeto com conteúdo próprio
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Outro' },
    });
    const newMeta = createRes.json() as { id: string };

    // Salva conteúdo no novo projeto antes de ativar
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${newMeta.id}`,
      payload: { dbml: 'Table outro { id int }', canvas: {} },
    });

    // Ativa o novo projeto
    const actRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${newMeta.id}/activate`,
    });
    expect(actRes.statusCode).toBe(200);
    const actBody = actRes.json() as { ok: boolean; activeId: string };
    expect(actBody.ok).toBe(true);
    expect(actBody.activeId).toBe(newMeta.id);

    // Rota legada GET /api/project deve refletir o projeto recém-ativado
    const legacyRes = await app.inject({ method: 'GET', url: '/api/project' });
    await app.close();

    const legacy = legacyRes.json() as { dbml: string };
    expect(legacy.dbml).toBe('Table outro { id int }');
  });

  it('retorna 404 para id inexistente', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/nao-existe/activate',
    });
    await app.close();

    expect(res.statusCode).toBe(404);
  });

  it('GET /api/projects retorna o activeId atualizado', async () => {
    const app = await buildApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Terceiro' },
    });
    const { id } = createRes.json() as { id: string };

    await app.inject({ method: 'POST', url: `/api/projects/${id}/activate` });

    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    const body = listRes.json() as { activeId: string };
    expect(body.activeId).toBe(id);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:id/import
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects/:id/import', () => {
  it('retorna resultado de import (dbml, imported, warnings) para projeto sem SQL', async () => {
    const app = await buildApp();
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string }[] };
    const id = projects[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/import`,
      payload: { dbml: 'Table x { id int }' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { dbml: string; imported: string[]; lineageFieldCount: number };
    expect(typeof body.dbml).toBe('string');
    expect(Array.isArray(body.imported)).toBe(true);
    expect(typeof body.lineageFieldCount).toBe('number');
  });

  it('import com SQL no input/ do projeto correto', async () => {
    const app = await buildApp();
    const listRes = await app.inject({ method: 'GET', url: '/api/projects' });
    const { projects } = listRes.json() as { projects: { id: string; slug: string }[] };
    const { id, slug } = projects[0];

    // Escreve SQL no input do projeto
    const inputDir = path.join(tmpDir, 'projects', slug, 'input');
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, 'schema.sql'),
      'CREATE TABLE cliente (id INT PRIMARY KEY, nome VARCHAR(100));',
      'utf8',
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/import`,
      payload: { dbml: '' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { imported: string[] };
    expect(body.imported.some((f) => f.includes('schema.sql'))).toBe(true);
  });

  it('retorna 404 para id inexistente', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/nao-existe/import',
      payload: { dbml: '' },
    });
    await app.close();

    expect(res.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// Compatibilidade: rotas legadas continuam funcionando
// ──────────────────────────────────────────────────────────────
describe('rotas legadas não quebram', () => {
  it('GET /api/project ainda funciona', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/project' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { dbml: string; canvas: unknown };
    expect(typeof body.dbml).toBe('string');
  });

  it('POST /api/import com DBML inválido retorna warning (não bloqueia)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: { dbml: 'Table broken { invalid syntax here' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { warnings?: string[]; dbml?: string };
    expect(body.warnings?.some((w) => w.includes('DBML do projeto ignorado'))).toBe(true);
    expect(typeof body.dbml).toBe('string');
  });
});
