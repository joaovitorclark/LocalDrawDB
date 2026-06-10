import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIR, INPUT_DIR, OUTPUT_DIR, ROOT } from '../files.ts';

describe('files.ts paths', () => {
  it('resolve data/ relativo ao clone (server/..)', () => {
    expect(DATA_DIR).toBe(path.join(ROOT, 'data'));
    expect(INPUT_DIR).toBe(path.join(ROOT, 'data', 'input'));
    expect(OUTPUT_DIR).toBe(path.join(ROOT, 'data', 'output'));
  });
});

describe('/api/meta', () => {
  it('expoe root e inputDir do clone atual', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerRoutes } = await import('../routes.ts');
    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { root: string; inputDir: string };
    expect(body.inputDir).toBe(INPUT_DIR);
    expect(body.root).toBe(ROOT);
    await app.close();
  });
});
