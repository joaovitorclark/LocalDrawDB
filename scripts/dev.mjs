// Dev orchestrator: aloca portas livres por clone e liga Vite -> API do mesmo projeto.
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateDevPorts, waitForPort } from './devPorts.mjs';
import { parseDevArgs, resolveSlugs } from './devArgs.mjs';

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

// Parse args — exits fast on error or --preview
let parsed;
try {
  parsed = parseDevArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (parsed.preview) {
  console.error('modo --preview chega na F4');
  process.exit(1);
}

// Resolve slugs for multi mode
let slugs; // null = shared mode, string[] = multi mode
if (parsed.mode === 'shared') {
  slugs = null;
} else {
  // multi or all — need to read registry
  const dataDir = process.env.LOCALDRAWDB_DATA_DIR ?? path.join(ROOT, 'data');
  const registryPath = path.join(dataDir, 'projects.json');
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (err) {
    console.error(`Não foi possível ler o registry de projetos: ${registryPath}\n${err.message}`);
    process.exit(1);
  }
  try {
    slugs = resolveSlugs(parsed, registry);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

/**
 * Start one server+vite pair.
 * @param {{ slug: string|null, apiPort: number, webPort: number }} opts
 * @returns {{ server: import('node:child_process').ChildProcess, web: import('node:child_process').ChildProcess }}
 */
async function startInstance({ slug, apiPort, webPort }) {
  const env = {
    ...process.env,
    PORT: String(apiPort),
    API_PORT: String(apiPort),
    VITE_PORT: String(webPort),
    ...(slug ? { LOCALDRAWDB_PROJECT: slug } : {}),
  };

  const nodeArgs = (script, ...args) => [script, ...args];

  const server = spawn(process.execPath, nodeArgs(TSX_CLI, 'watch', 'server/index.ts'), {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });

  await waitForPort(apiPort);

  const web = spawn(process.execPath, nodeArgs(VITE_CLI, '--port', String(webPort), '--strictPort'), {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });

  return { server, web };
}

// Collect all child handles for supervision
/** @type {Array<{ server: import('node:child_process').ChildProcess, web: import('node:child_process').ChildProcess }>} */
const instances = [];

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { server, web } of instances) {
    server.kill('SIGTERM');
    web.kill('SIGTERM');
  }
  try {
    unlinkSync(DEV_META);
  } catch {
    /* ok */
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function supervise(handle) {
  handle.server.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
  handle.web.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

if (slugs === null) {
  // Shared mode — identical to today's behavior
  const { apiPort, webPort } = await allocateDevPorts();

  writeFileSync(DEV_META, JSON.stringify({ instances: [{ slug: null, apiPort, webPort }], root: ROOT }, null, 2));

  console.log(`\nlocaldrawdb dev`);
  console.log(`  projeto: ${ROOT}`);
  console.log(`  web:     http://127.0.0.1:${webPort}`);
  console.log(`  api:     http://127.0.0.1:${apiPort}\n`);

  let handle;
  try {
    handle = await startInstance({ slug: null, apiPort, webPort });
  } catch (err) {
    console.error(String(err));
    try { unlinkSync(DEV_META); } catch { /* ok */ }
    process.exit(1);
  }

  instances.push(handle);
  supervise(handle);
} else {
  // Multi mode — one instance per slug
  /** @type {Array<{ slug: string, apiPort: number, webPort: number }>} */
  const instanceMeta = [];

  for (const slug of slugs) {
    const { apiPort, webPort } = await allocateDevPorts();
    instanceMeta.push({ slug, apiPort, webPort });
  }

  // Write meta before spawning (supervisor may read it)
  writeFileSync(DEV_META, JSON.stringify({ instances: instanceMeta.map(m => ({ slug: m.slug, apiPort: m.apiPort, webPort: m.webPort })), root: ROOT }, null, 2));

  // Print table
  const colW = Math.max(...slugs.map(s => s.length), 'projeto'.length);
  console.log(`\nlocaldrawdb dev — modo multi`);
  console.log(`  ${'projeto'.padEnd(colW)}  web    api`);
  console.log(`  ${'─'.repeat(colW)}  ─────  ─────`);
  for (const { slug, apiPort, webPort } of instanceMeta) {
    console.log(`  ${slug.padEnd(colW)}  ${webPort}  ${apiPort}`);
  }
  console.log();

  // Spawn all instances sequentially (each waits for its API port before continuing)
  for (const { slug, apiPort, webPort } of instanceMeta) {
    let handle;
    try {
      handle = await startInstance({ slug, apiPort, webPort });
    } catch (err) {
      console.error(`Erro ao iniciar instância '${slug}': ${err}`);
      shutdown(1);
      break;
    }
    instances.push(handle);
    supervise(handle);
  }
}
