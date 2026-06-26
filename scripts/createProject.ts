// Entry tsx do launcher: cria um projeto reusando a lógica canônica de
// files.ts (respeita LOCALDRAWDB_DATA_DIR). Imprime o slug resultante.
import { createProject } from '../server/files.ts';

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Uso: createProject <nome>');
  process.exit(1);
}

const meta = await createProject(name);
console.log(`Projeto criado: ${meta.name} (slug: ${meta.slug})`);
