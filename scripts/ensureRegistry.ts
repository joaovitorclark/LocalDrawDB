// Entrypoint mínimo (rodado via tsx pelo launcher) que garante a existência do
// registry de projetos. Delega à lógica canônica idempotente de files.ts, que
// respeita LOCALDRAWDB_DATA_DIR, reconstrói o registry a partir das pastas em
// projects/ quando o arquivo foi apagado, e migra instalações legadas/limpas.
import { ensureRegistry } from '../server/files.ts';

await ensureRegistry();
