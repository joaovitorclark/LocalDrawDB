// Gestão de nós do canvas (padrão Structura): separa estrutura (parsed) de layout
// (posições, propriedade do React Flow). Evita o snap-back ao arrastar.
import { useEffect, type MutableRefObject } from 'react';
import type { Node } from 'reactflow';
import type { ParseResult, TableView } from '../../dsl/parse';

export type Positions = Record<string, { x: number; y: number }>;

const TABLE_W = 230;
const estHeight = (t: TableView) => 34 + t.columns.length * 25 + 26;

function gridPosition(index: number): { x: number; y: number } {
  const COLS = 3;
  return { x: (index % COLS) * 320 + 40, y: Math.floor(index / COLS) * 280 + 40 };
}

/** Caixas dos TableGroups, a partir das posições resolvidas das tabelas-membro. */
function groupNodes(
  tables: TableView[],
  posOf: (t: TableView, i: number) => { x: number; y: number },
): Node[] {
  const byGroup = new Map<string, { x: number; y: number; w: number; h: number }[]>();
  tables.forEach((t, i) => {
    if (!t.group) return;
    const p = posOf(t, i);
    byGroup.set(t.group, [...(byGroup.get(t.group) ?? []), { x: p.x, y: p.y, w: TABLE_W, h: estHeight(t) }]);
  });

  const pad = 24;
  const out: Node[] = [];
  for (const [name, boxes] of byGroup) {
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    out.push({
      id: `group:${name}`,
      type: 'group',
      position: { x: minX - pad, y: minY - pad - 16 },
      data: { label: name },
      draggable: false,
      selectable: false,
      zIndex: -1,
      style: { width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 + 16 },
    });
  }
  return out;
}

function classOf(id: string, related: Set<string> | null): string | undefined {
  if (!related) return undefined;
  return related.has(id) ? 'node--related' : 'node--dimmed';
}

/**
 * Reconcilia os nós quando a estrutura (parsed.tables) ou as posições mudam.
 * Preserva a posição "viva" de nós existentes; usa `positions[id]` (persistida /
 * restaurada por undo) com prioridade, e `gridPosition` só para nós novos.
 * Não depende de `related` (hover não reconstrói posição) — usa `relatedRef`.
 */
export function useCanvasNodes(
  parsed: ParseResult,
  positions: Positions,
  setNodes: (updater: (prev: Node[]) => Node[]) => void,
  relatedRef: MutableRefObject<Set<string> | null>,
): void {
  useEffect(() => {
    setNodes((prev) => {
      const prevPos = new Map(
        prev.filter((n) => n.type === 'table').map((n) => [n.id, n.position] as const),
      );
      const posOf = (t: TableView, i: number) =>
        positions[t.id] ?? prevPos.get(t.id) ?? gridPosition(i);

      const tableNodes: Node[] = parsed.tables.map((t, i) => ({
        id: t.id,
        type: 'table',
        position: posOf(t, i),
        data: t,
        className: classOf(t.id, relatedRef.current),
      }));
      return [...groupNodes(parsed.tables, posOf), ...tableNodes];
    });
  }, [parsed.tables, positions, setNodes, relatedRef]);
}

/** Atualiza apenas o `className` (highlight/dim) sem mexer na posição. */
export function useHoverHighlight(
  setNodes: (updater: (prev: Node[]) => Node[]) => void,
  related: Set<string> | null,
): void {
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) =>
        n.type === 'table' ? { ...n, className: classOf(n.id, related) } : n,
      ),
    );
  }, [related, setNodes]);
}
