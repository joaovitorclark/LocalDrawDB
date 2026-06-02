import { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TableNode } from './TableNode';
import { RelationEdge } from './RelationEdge';
import { EdgeMarkers } from './EdgeMarkers';
import { GroupNode } from './GroupNode';
import { useCanvasNodes, useHoverHighlight, type Positions } from './hooks/useCanvasNodes';
import { useInteraction } from '../store/interaction';
import type { ParseResult } from '../dsl/parse';

const stripHandle = (h: string | null | undefined) => (h ? h.replace(/^[st]:/, '') : '');

const nodeTypes = { table: TableNode, group: GroupNode };
const edgeTypes = { relation: RelationEdge };

export type RefEndpoints = { fromTbl: string; fromCol: string; toTbl: string; toCol: string };

type Props = {
  parsed: ParseResult;
  positions: Positions;
  onPositionsChange: (p: Positions) => void;
  onCreateRef: (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => void;
  onRemoveRef: (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => void;
};

export function Canvas({ parsed, positions, onPositionsChange, onCreateRef, onRemoveRef }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const hovered = useInteraction((s) => s.hoveredTableId);
  const setHovered = useInteraction((s) => s.setHovered);
  const selectColumn = useInteraction((s) => s.selectColumn);

  // Tabelas vizinhas da tabela em hover (via refs).
  const related = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>([hovered]);
    for (const r of parsed.refs) {
      if (r.source === hovered) set.add(r.target);
      if (r.target === hovered) set.add(r.source);
    }
    return set;
  }, [hovered, parsed.refs]);
  const relatedRef = useRef(related);
  relatedRef.current = related;

  // Nós: estrutura (preserva posição) + highlight de hover (só className).
  useCanvasNodes(parsed, positions, setNodes, relatedRef);
  useHoverHighlight(setNodes, related);

  // Arestas: estrutura (handles por coluna + endpoints para delete/reconnect).
  useEffect(() => {
    const next: Edge[] = parsed.refs.map((r) => {
      const endpoints: RefEndpoints = {
        fromTbl: r.source,
        fromCol: r.fromCol,
        toTbl: r.target,
        toCol: r.toCol,
      };
      return {
        id: r.id,
        source: r.source,
        target: r.target,
        sourceHandle: `s:${r.fromCol}`,
        targetHandle: `t:${r.toCol}`,
        type: 'relation',
        data: {
          fromRel: r.fromRel,
          toRel: r.toRel,
          endpoints,
          onRemove: () => onRemoveRef(endpoints.fromTbl, endpoints.fromCol, endpoints.toTbl, endpoints.toCol),
        },
      };
    });
    setEdges(next);
  }, [parsed.refs, setEdges, onRemoveRef]);

  // Highlight/dim de arestas no hover (preserva seleção).
  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        const touches = hovered ? e.source === hovered || e.target === hovered : false;
        return {
          ...e,
          animated: touches,
          className: hovered ? (touches ? 'edge--highlight' : 'edge--dimmed') : undefined,
          data: { ...e.data, highlighted: touches },
        };
      }),
    );
  }, [hovered, setEdges]);

  // Drag-to-create.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      onCreateRef(c.source, stripHandle(c.sourceHandle), c.target, stripHandle(c.targetHandle));
    },
    [onCreateRef],
  );

  // Persiste a posição ao soltar (confiável).
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      onPositionsChange({ ...positions, [node.id]: node.position });
    },
    [positions, onPositionsChange],
  );

  // Deletar relação (tecla Delete/Backspace ou botão ✕).
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        const ep = e.data?.endpoints as RefEndpoints | undefined;
        if (ep) onRemoveRef(ep.fromTbl, ep.fromCol, ep.toTbl, ep.toCol);
      }
    },
    [onRemoveRef],
  );

  // Reconectar: troca o Ref antigo pelo novo destino/origem.
  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, c: Connection) => {
      const ep = oldEdge.data?.endpoints as RefEndpoints | undefined;
      if (!ep || !c.source || !c.target) return;
      const fromCol = stripHandle(c.sourceHandle);
      const toCol = stripHandle(c.targetHandle);
      if (!fromCol || !toCol) return;
      onRemoveRef(ep.fromTbl, ep.fromCol, ep.toTbl, ep.toCol);
      onCreateRef(c.source, fromCol, c.target, toCol);
    },
    [onRemoveRef, onCreateRef],
  );

  return (
    <>
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onEdgeUpdate={onEdgeUpdate}
        deleteKeyCode={['Delete', 'Backspace']}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onPaneClick={() => selectColumn(null)}
        fitView
        minZoom={0.1}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </>
  );
}
