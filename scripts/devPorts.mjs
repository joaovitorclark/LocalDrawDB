import net from 'node:net';

/** @param {number} start @param {string} host @param {Set<number>} exclude */
export function findFreePort(start, host = '127.0.0.1', exclude = new Set()) {
  return new Promise((resolve) => {
    const probe = (port) => {
      if (exclude.has(port)) return probe(port + 1);
      const server = net.createServer();
      server.unref();
      server.on('error', () => probe(port + 1));
      server.listen({ port, host }, () => {
        const addr = server.address();
        const p = typeof addr === 'object' && addr ? addr.port : port;
        server.close(() => resolve(p));
      });
    };
    probe(start);
  });
}

/** @param {number} port @param {string} host @param {number} timeoutMs */
export async function waitForPort(port, host = '127.0.0.1', timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ port, host }, () => {
          socket.end();
          resolve(undefined);
        });
        socket.on('error', reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`API nao respondeu em ${host}:${port} dentro de ${timeoutMs}ms`);
}

export async function allocateDevPorts(env = process.env, exclude = new Set()) {
  const apiPort = await findFreePort(Number(env.PORT) || 5174, '127.0.0.1', exclude);
  const webPort = await findFreePort(Number(env.VITE_PORT) || 5173, '127.0.0.1', new Set([...exclude, apiPort]));
  if (webPort === apiPort) {
    throw new Error(`Portas dev conflitantes (web=api=${apiPort}). Encerre outros npm run dev e tente de novo.`);
  }
  return { apiPort, webPort };
}
