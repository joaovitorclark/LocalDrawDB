/** Aviso exibido após criar um projeto em modo pinned (instância fixada). */
export function pinnedCreatedMessage(name: string): string {
  return `Projeto "${name}" criado. Reinicie o dev (./ldb) para abri-lo na própria porta.`;
}
