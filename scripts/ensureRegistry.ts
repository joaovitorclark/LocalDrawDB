// Entrypoint mínimo (rodado via tsx pelo launcher) que garante a existência do
// registry de projetos. Delega à migração canônica idempotente de files.ts, que
// respeita LOCALDRAWDB_DATA_DIR e migra instalações legadas quando aplicável.
import { migrateLegacy } from '../server/files.ts';

await migrateLegacy();
