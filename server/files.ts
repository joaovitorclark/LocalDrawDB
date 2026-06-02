// Acesso ao diretório data/ (input, output, persistência). NUNCA versionado.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const INPUT_DIR = path.join(DATA_DIR, 'input');
export const OUTPUT_DIR = path.join(DATA_DIR, 'output');
export const PROJECT_DBML = path.join(DATA_DIR, 'project.dbml');
export const CANVAS_JSON = path.join(DATA_DIR, 'canvas.json');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Lê todos os .sql de data/input/ concatenando o conteúdo. */
export async function readInputSql(): Promise<{ file: string; content: string }[]> {
  await ensureDir(INPUT_DIR);
  const entries = await fs.readdir(INPUT_DIR);
  const sqlFiles = entries.filter((f) => f.toLowerCase().endsWith('.sql'));
  return Promise.all(
    sqlFiles.map(async (file) => ({
      file,
      content: await fs.readFile(path.join(INPUT_DIR, file), 'utf8'),
    })),
  );
}

/** Escreve um arquivo dentro de data/output/ (cria subpastas). Retorna caminho relativo. */
export async function writeOutput(relPath: string, content: string | Uint8Array): Promise<string> {
  const full = path.join(OUTPUT_DIR, relPath);
  await ensureDir(path.dirname(full));
  await fs.writeFile(full, content, 'utf8');
  return path.relative(ROOT, full);
}

/** Persistência do projeto: DBML + estado do canvas. */
export async function loadProject(): Promise<{ dbml: string; canvas: unknown }> {
  await ensureDir(DATA_DIR);
  const dbml = await fs.readFile(PROJECT_DBML, 'utf8').catch(() => '');
  const canvasRaw = await fs.readFile(CANVAS_JSON, 'utf8').catch(() => '{}');
  let canvas: unknown = {};
  try {
    canvas = JSON.parse(canvasRaw);
  } catch {
    canvas = {};
  }
  return { dbml, canvas };
}

export async function saveProject(dbml: string, canvas: unknown): Promise<void> {
  await ensureDir(DATA_DIR);
  await fs.writeFile(PROJECT_DBML, dbml, 'utf8');
  await fs.writeFile(CANVAS_JSON, JSON.stringify(canvas ?? {}, null, 2), 'utf8');
}
