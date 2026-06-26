// `npm run new -- <nome>`: cria um projeto reusando o núcleo do CLI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectCli } from './registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.error('Uso: npm run new -- <nome>');
  process.exit(1);
}

const dataDir = process.env.LOCALDRAWDB_DATA_DIR ?? path.join(ROOT, 'data');
try {
  createProjectCli(name, dataDir);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
