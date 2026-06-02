// Reordena o DBML em grupos: project/comment -> enums -> tables -> tableGroups
// -> refs -> records. Estável dentro de cada grupo e idempotente.
import { splitDbmlBlocks, type BlockType } from './blocks';

const ORDER: BlockType[] = [
  'comment',
  'project',
  'enum',
  'table',
  'tableGroup',
  'layerGroup',
  'ref',
  'lineage',
  'records',
];

export function organize(src: string): string {
  if (!src.trim()) return src;
  const blocks = splitDbmlBlocks(src).filter((b) => b.type !== 'blank');

  const out: string[] = [];
  for (const type of ORDER) {
    const group = blocks.filter((b) => b.type === type);
    for (const b of group) {
      // Normaliza o texto do bloco (remove linhas em branco nas pontas).
      out.push(b.text.replace(/^\n+/, '').replace(/\n+$/, ''));
    }
  }
  return out.join('\n\n').trim() + '\n';
}
