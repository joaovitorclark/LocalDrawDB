import { useMemo } from 'react';
import { useStore, type Node, type Position } from 'reactflow';
import type { TableNodeData } from './actions';
import {
  columnHandleFlowPoint,
  needsScrollAwareHandles,
  parseFieldLineageColumnHandle,
  parseRelationColumnHandle,
  sidePortFlowPoint,
} from './columnHandleGeometry';
import { useTableScrollStore } from './tableScrollStore';

export type ColumnEdgeCoords = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

function resolveEndpoint(
  node: Node<TableNodeData>,
  column: string,
  side: 'source' | 'target',
  scrollTop: number,
) {
  return (
    columnHandleFlowPoint(node, column, side, scrollTop) ?? sidePortFlowPoint(node, side)
  );
}

/** Recalcula pontos de aresta coluna↔coluna quando a tabela tem scroll interno. */
export function useColumnEdgeCoords(
  source: string,
  target: string,
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
  mode: 'relation' | 'fieldLineage',
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  _sourcePosition: Position,
  _targetPosition: Position,
): ColumnEdgeCoords {
  const version = useTableScrollStore((s) => s.version);
  const scrollFor = useTableScrollStore((s) => s.byNode);

  const sourceNode = useStore((s) => s.nodeInternals.get(source)) as Node<TableNodeData> | undefined;
  const targetNode = useStore((s) => s.nodeInternals.get(target)) as Node<TableNodeData> | undefined;

  return useMemo(() => {
    let sx = sourceX;
    let sy = sourceY;
    let tx = targetX;
    let ty = targetY;
    const parse = mode === 'fieldLineage' ? parseFieldLineageColumnHandle : parseRelationColumnHandle;

    const src = parse(sourceHandle);
    if (src && sourceNode && needsScrollAwareHandles(sourceNode.data)) {
      const pt = resolveEndpoint(sourceNode, src.column, 'source', scrollFor[source] ?? 0);
      sx = pt.x;
      sy = pt.y;
    }

    const tgt = parse(targetHandle);
    if (tgt && targetNode && needsScrollAwareHandles(targetNode.data)) {
      const pt = resolveEndpoint(targetNode, tgt.column, 'target', scrollFor[target] ?? 0);
      tx = pt.x;
      ty = pt.y;
    }

    return { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty };
  }, [
    source,
    target,
    sourceHandle,
    targetHandle,
    mode,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceNode,
    targetNode,
    scrollFor,
    version,
  ]);
}
