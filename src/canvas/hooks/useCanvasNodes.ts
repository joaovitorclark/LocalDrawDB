// Gestão de nós do canvas (padrão Structura): separa estrutura (parsed) de layout
// (posições, propriedade do React Flow). Evita o snap-back ao arrastar.
import { useEffect, type MutableRefObject } from 'react';
import type { Node } from 'reactflow';
import type { ParseResult, TableView } from '../../dsl/parse';

export type Positions = Record<string, { x: number; y: number }>;

export type NodeOpts = {
  collapsedGroups: Set<string>;
  hiddenTables: Set<string>; // escondidas (camada oculta ou grupo colapsado)
  dimmedTables: Set<string>; // esmaecidas (camada em modo esmaecer)
  onToggleGroup: (name: string) => void;
};

const TABLE_W = 230;
const estHeight = (t: TableView) => 34 + t.columns.length * 25 + 26;

function gridPosition(index: number): { x: number; y: number } {
  const COLS = 3;
  return { x: (index % COLS) * 320 + 40, y: Math.floor(index / COLS) * 280 + 40 };
}

/** Caixas dos TableGroups (arrastáveis); compactas quando colapsadas. */
function groupNodes(
  tables: TableView[],
  posOf: (t: TableView, i: number) => { x: number; y: number },
  opts: NodeOpts,
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
    const collapsed = opts.collapsedGroups.has(name);
    out.push({
      id: `group:${name}`,
      type: 'group',
      position: { x: minX - pad, y: minY - pad - 16 },
      data: { label: name, collapsed, count: boxes.length, onToggle: () => opts.onToggleGroup(name) },
      draggable: true, // mover o grupo inteiro
      selectable: false,
      zIndex: -1,
      style: collapsed
        ? { width: 240, height: 46 }
        : { width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 + 16 },
    });
  }
  return out;
}

function classOf(id: string, related: Set<string> | null): string | undefined {
  if (!related) return undefined;
  return related.has(id) ? 'node--related' : 'node--dimmed';
}

export function useCanvasNodes(
  parsed: ParseResult,
  positions: Positions,
  setNodes: (updater: (prev: Node[]) => Node[]) => void,
  relatedRef: MutableRefObject<Set<string> | null>,
  opts: NodeOpts,
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
        hidden: opts.hiddenTables.has(t.id),
        style: opts.dimmedTables.has(t.id) ? { opacity: 0.35 } : undefined,
        className: classOf(t.id, relatedRef.current),
      }));
      return [...groupNodes(parsed.tables, posOf, opts), ...tableNodes];
    });
  }, [parsed.tables, positions, setNodes, relatedRef, opts]);
}

/** Atualiza apenas o `className` (highlight/dim de hover) sem mexer na posição. */
export function useHoverHighlight(
  setNodes: (updater: (prev: Node[]) => Node[]) => void,
  related: Set<string> | null,
): void {
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => (n.type === 'table' ? { ...n, className: classOf(n.id, related) } : n)),
    );
  }, [related, setNodes]);
}
