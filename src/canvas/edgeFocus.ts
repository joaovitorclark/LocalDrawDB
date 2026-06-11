import type { Edge } from 'reactflow';

export type SelectedColumn = { table: string; column: string };
export type EdgeFocusTier = 'primary' | 'secondary' | 'dimmed';

function stripHandle(h: string | null | undefined, prefix: string): string {
  if (!h?.startsWith(prefix)) return '';
  return h.slice(prefix.length);
}

/** Tier visual de aresta quando uma coluna está selecionada no canvas. */
export function edgeFocusTier(e: Edge, col: SelectedColumn): EdgeFocusTier {
  const { table, column } = col;

  if (e.type === 'relation') {
    const srcCol = stripHandle(e.sourceHandle, 's:');
    const tgtCol = stripHandle(e.targetHandle, 't:');
    const touchesColumn =
      (e.source === table && srcCol === column) || (e.target === table && tgtCol === column);
    if (touchesColumn) return 'primary';
    if (e.source === table || e.target === table) return 'secondary';
    return 'dimmed';
  }

  if (e.type === 'fieldLineage') {
    const srcCol = stripHandle(e.sourceHandle, 'fl:s:');
    const tgtCol = stripHandle(e.targetHandle, 'fl:t:');
    const touchesColumn =
      (e.source === table && srcCol === column) || (e.target === table && tgtCol === column);
    if (touchesColumn) return 'primary';
    if (e.source === table || e.target === table) return 'secondary';
    return 'dimmed';
  }

  if (e.type === 'lineage') {
    if (e.source === table || e.target === table) return 'secondary';
    return 'dimmed';
  }

  return 'dimmed';
}

export function edgeClassForTier(e: Edge, tier: EdgeFocusTier, selected: boolean): string {
  if (selected || tier === 'primary') {
    if (e.type === 'lineage') return 'edge--highlight edge--lineage';
    if (e.type === 'fieldLineage') return 'edge--highlight edge--field-lineage';
    return 'edge--highlight';
  }
  if (tier === 'secondary') return 'edge--muted';
  return 'edge--dimmed';
}
