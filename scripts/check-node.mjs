// Valida versão mínima do Node antes de dev/start (evita erro críptico do Vite/tsx).
const MIN_MAJOR = 20;
const warnOnly = process.argv.includes('--warn');

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < MIN_MAJOR) {
  const msg = [
    '',
    `LocalDrawDB exige Node.js ${MIN_MAJOR}+ (atual: ${process.version}).`,
    'Instale em https://nodejs.org/ (LTS 22 recomendado) ou use nvm/fnm:',
    '  nvm install    # lê .nvmrc',
    '  fnm install    # lê .node-version',
    '',
  ].join('\n');
  if (warnOnly) {
    console.warn(msg);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
