// Dev orchestrator: aloca portas livres por clone e liga Vite -> API do mesmo projeto.
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateDevPorts, waitForPort } from './devPorts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_META = path.join(ROOT, '.localdrawdb-dev.json');
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const VITE_CLI = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

function requireDeps() {
  if (!existsSync(TSX_CLI) || !existsSync(VITE_CLI)) {
    console.error('\nDependencias ausentes. Rode primeiro:\n  npm install\n');
    process.exit(1);
  }
}

requireDeps();

const { apiPort, webPort } = await allocateDevPorts();

writeFileSync(DEV_META, JSON.stringify({ apiPort, webPort, root: ROOT }, null, 2));

console.log(`\nlocaldrawdb dev`);
console.log(`  projeto: ${ROOT}`);
console.log(`  web:     http://127.0.0.1:${webPort}`);
console.log(`  api:     http://127.0.0.1:${apiPort}\n`);

const env = {
  ...process.env,
  PORT: String(apiPort),
  API_PORT: String(apiPort),
  VITE_PORT: String(webPort),
};

const nodeArgs = (script, ...args) => [script, ...args];

const server = spawn(process.execPath, nodeArgs(TSX_CLI, 'watch', 'server/index.ts'), {
  cwd: ROOT,
  env,
  stdio: 'inherit',
});

try {
  await waitForPort(apiPort);
} catch (err) {
  console.error(String(err));
  server.kill('SIGTERM');
  try {
    unlinkSync(DEV_META);
  } catch {
    /* ok */
  }
  process.exit(1);
}

const web = spawn(process.execPath, nodeArgs(VITE_CLI, '--port', String(webPort), '--strictPort'), {
  cwd: ROOT,
  env,
  stdio: 'inherit',
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
