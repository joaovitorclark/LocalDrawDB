import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIR, ROOT } from '../files.ts';

describe('files.ts paths', () => {
  it('resolve data/ relativo ao clone (server/..)', () => {
    expect(DATA_DIR).toBe(path.join(ROOT, 'data'));
  });
});

describe('/api/meta', () => {
  it('expoe root e inputDir do projeto ativo (dentro de data/projects/)', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerRoutes } = await import('../routes.ts');
    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { root: string; inputDir: string };
    // inputDir deve apontar para o input do projeto ativo (dentro de data/projects/)
    expect(body.inputDir).toContain(path.join('data', 'projects'));
    expect(body.inputDir).toContain('input');
    expect(body.root).toBe(ROOT);
    await app.close();
  });
});
