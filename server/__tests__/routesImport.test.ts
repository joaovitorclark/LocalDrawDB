import { describe, expect, it } from 'vitest';

describe('POST /api/import', () => {
  it('DBML inválido não bloqueia merge (retorna warning)', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerRoutes } = await import('../routes.ts');
    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: { dbml: 'Table broken { invalid syntax here' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { warnings?: string[]; dbml?: string };
    expect(body.warnings?.some((w) => w.includes('DBML do projeto ignorado'))).toBe(true);
    expect(typeof body.dbml).toBe('string');
    await app.close();
  });
});
