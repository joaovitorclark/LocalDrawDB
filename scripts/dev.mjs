// Dev orchestrator: aloca portas livres por clone e liga Vite -> API do mesmo projeto.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_META = path.join(ROOT, '.localdrawdb-dev.json');

function findFreePort(start, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const probe = (port) => {
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

const apiPort = await findFreePort(Number(process.env.PORT) || 5174);
const webPort = await findFreePort(Number(process.env.VITE_PORT) || 5173);

writeFileSync(DEV_META, JSON.stringify({ apiPort, webPort, root: ROOT }, null, 2));

console.log(`\nlocaldrawdb dev`);
console.log(`  projeto: ${ROOT}`);
console.log(`  web:     http://127.0.0.1:${webPort}`);
console.log(`  api:     http://127.0.0.1:${apiPort}\n`);

const env = { ...process.env, PORT: String(apiPort), API_PORT: String(apiPort) };

const server = spawn('npx', ['tsx', 'watch', 'server/index.ts'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: true,
});

const web = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: true,
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  server.kill('SIGTERM');
  web.kill('SIGTERM');
  try {
    unlinkSync(DEV_META);
  } catch {
    /* ok */
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
server.on('exit', (code) => {
  if (code && code !== 0) shutdown(code);
});
web.on('exit', (code) => {
  if (code && code !== 0) shutdown(code);
});
