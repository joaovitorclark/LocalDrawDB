// Servidor Fastify: API /api + (em produção) serve o frontend buildado em dist/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { registerRoutes } from './routes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 5174);
const isProd = process.env.NODE_ENV === 'production';

async function main() {
  const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });

  await registerRoutes(app);

  // Em produção, serve os estáticos buildados pelo Vite.
  const dist = path.join(ROOT, 'dist');
  if (isProd && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: '127.0.0.1' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
