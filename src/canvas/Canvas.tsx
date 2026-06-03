import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, ConnectionMode, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TableNode } from './TableNode';
import { RelationEdge } from './RelationEdge';
import { LineageEdge } from './LineageEdge';
import { EdgeMarkers } from './EdgeMarkers';
import { GroupNode } from './GroupNode';
import { useCanvasNodes, useHoverHighlight, type NodeOpts, type Positions } from './hooks/useCanvasNodes';
import { useInteraction } from '../store/interaction';
import type { ParseResult } from '../dsl/parse';
import type { LineageLink } from '../api';
import { DEFAULT_LINEAGE_SOURCE, DEFAULT_LINEAGE_TARGET, isLineageHandle, pickLineageHandles } from './lineageHandles';

const stripHandle = (h: string | null | undefined) => (h ? h.replace(/^[st]:/, '') : '');
const nodeTypes = { table: TableNode, group: GroupNode };
const edgeTypes = { relation: RelationEdge, lineage: LineageEdge };

export type RefEndpoints = { fromTbl: string; fromCol: string; toTbl: string; toCol: string };

type Props = {
  parsed: ParseResult;
  positions: Positions;
  onPositionsChange: (p: Positions) => void;
  onCreateRef: (a: string, ac: string, b: string, bc: string) => void;
  onRemoveRef: (a: string, ac: string, b: string, bc: string) => void;
  lineage: LineageLink[];
  onCreateLineage: (source: string, target: string) => void;
  onRemoveLineage: (source: string, target: string) => void;
  layerOf: (tableId: string) => string | undefined;
  collapsedGroups: string[];
  onToggleGroup: (name: string) => void;
  focusTableId?: string | null;
  onFocusTableDone?: () => void;
};

function FocusTableHelper({
  tableId,
  onDone,
}: {
  tableId: string | null | undefined;
  onDone?: () => void;
}) {
  const { fitView, getNode } = useReactFlow();
  useEffect(() => {
    if (!tableId) return;
    const node = getNode(tableId);
    if (node) fitView({ nodes: [node], padding: 0.45, duration: 280, maxZoom: 1.25 });
    onDone?.();
  }, [tableId, fitView, getNode, onDone]);
  return null;
}

export function Canvas(props: Props) {
  const { parsed, positions, onPositionsChange, onCreateRef, onRemoveRef, lineage,
    onCreateLineage, onRemoveLineage, layerOf, collapsedGroups, onToggleGroup,
    focusTableId, onFocusTableDone } = props;
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const hovered = useInteraction((s) => s.hoveredTableId);
  const setHovered = useInteraction((s) => s.setHovered);
  const selectColumn = useInteraction((s) => s.selectColumn);
  const selectTable = useInteraction((s) => s.selectTable);
  const selectGroup = useInteraction((s) => s.selectGroup);
  const hiddenLayers = useInteraction((s) => s.hiddenLayers);
  const layerDimMode = useInteraction((s) => s.layerDimMode);
  const lineageMode = useInteraction((s) => s.lineageMode);
  const lineageVisible = useInteraction((s) => s.lineageVisible);
  const showLineage = lineageVisible || lineageMode;
  const [connecting, setConnecting] = useState(false);

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

  // Visibilidade por camada + colapso → hidden/dim.
  const opts = useMemo<NodeOpts>(() => {
    const collapsed = new Set(collapsedGroups);
    const hidden = new Set<string>();
    const dimmed = new Set<string>();
    for (const t of parsed.tables) {
      const groupHidden = t.group ? collapsed.has(t.group) : false;
      const layer = layerOf(t.id);
      const layerOff = !!layer && hiddenLayers.has(layer);
      if (groupHidden || (layerOff && !layerDimMode)) hidden.add(t.id);
      else if (layerOff && layerDimMode) dimmed.add(t.id);
    }
    return { collapsedGroups: collapsed, hiddenTables: hidden, dimmedTables: dimmed, onToggleGroup };
  }, [parsed.tables, collapsedGroups, hiddenLayers, layerDimMode, layerOf, onToggleGroup]);

  useCanvasNodes(parsed, positions, setNodes, relatedRef, opts);
  useHoverHighlight(setNodes, related);

  // Arestas: PK/FK (relation) — ocultas no modo linhagem; linhagem só com modo ativo.
  useEffect(() => {
    setEdges((prev) => {
      const prevLin = new Map(
        prev.filter((e) => e.type === 'lineage').map((e) => [e.id, e] as const),
      );
      const relEdges: Edge[] = lineageMode
        ? []
        : parsed.refs.map((r) => {
            const endpoints: RefEndpoints = { fromTbl: r.source, fromCol: r.fromCol, toTbl: r.target, toCol: r.toCol };
            return {
              id: r.id, source: r.source, target: r.target,
              sourceHandle: `s:${r.fromCol}`, targetHandle: `t:${r.toCol}`,
              type: 'relation',
              data: { fromRel: r.fromRel, toRel: r.toRel, endpoints, onRemove: () => onRemoveRef(r.source, r.fromCol, r.target, r.toCol) },
            };
          });
      const linEdges: Edge[] = showLineage
        ? lineage.map((l) => {
            const id = `lin:${l.source}->${l.target}`;
            const prior = prevLin.get(id);
            const edge: Edge = {
              id, source: l.source, target: l.target, type: 'lineage',
              data: { onRemove: () => onRemoveLineage(l.source, l.target) },
            };
            if (lineageMode) {
              if (prior?.sourceHandle && prior?.targetHandle) {
                edge.sourceHandle = prior.sourceHandle;
                edge.targetHandle = prior.targetHandle;
              } else {
                const sp = positions[l.source];
                const tp = positions[l.target];
                const handles =
                  sp && tp
                    ? pickLineageHandles(sp, tp)
                    : { sourceHandle: DEFAULT_LINEAGE_SOURCE, targetHandle: DEFAULT_LINEAGE_TARGET };
                edge.sourceHandle = handles.sourceHandle;
                edge.targetHandle = handles.targetHandle;
              }
            }
            return edge;
          })
        : [];
      return [...relEdges, ...linEdges];
    });
  }, [parsed.refs, lineage, lineageMode, showLineage, positions, setEdges, onRemoveRef, onRemoveLineage]);

  useEffect(() => {
    setEdges((prev) => prev.map((e) => {
      if (e.type !== 'relation') return e;
      const touches = hovered ? e.source === hovered || e.target === hovered : false;
      return { ...e, animated: touches, className: hovered ? (touches ? 'edge--highlight' : 'edge--dimmed') : undefined, data: { ...e.data, highlighted: touches } };
    }));
  }, [hovered, setEdges]);

  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      if (lineageMode) {
        return isLineageHandle(c.sourceHandle) && isLineageHandle(c.targetHandle);
      }
      return !!c.sourceHandle?.startsWith('s:') && !!c.targetHandle?.startsWith('t:');
    },
    [lineageMode],
  );

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    if (lineageMode) {
      onCreateLineage(c.source, c.target);
      const id = `lin:${c.source}->${c.target}`;
      const sourceHandle =
        c.sourceHandle && isLineageHandle(c.sourceHandle)
          ? c.sourceHandle
          : (() => {
              const sp = positions[c.source];
              const tp = positions[c.target];
              return sp && tp ? pickLineageHandles(sp, tp).sourceHandle : DEFAULT_LINEAGE_SOURCE;
            })();
      const targetHandle =
        c.targetHandle && isLineageHandle(c.targetHandle)
          ? c.targetHandle
          : (() => {
              const sp = positions[c.source];
              const tp = positions[c.target];
              return sp && tp ? pickLineageHandles(sp, tp).targetHandle : DEFAULT_LINEAGE_TARGET;
            })();
      setEdges((prev) => {
        const rest = prev.filter((e) => e.id !== id);
        return [
          ...rest,
          {
            id,
            source: c.source!,
            target: c.target!,
            type: 'lineage',
            sourceHandle,
            targetHandle,
            data: { onRemove: () => onRemoveLineage(c.source!, c.target!) },
          },
        ];
      });
      return;
    }
    onCreateRef(c.source, stripHandle(c.sourceHandle), c.target, stripHandle(c.targetHandle));
  }, [lineageMode, onCreateLineage, onCreateRef, onRemoveLineage, positions, setEdges]);

  // Mover grupo inteiro: aplica o delta às tabelas-membro.
  const groupDrag = useRef<{ name: string; last: { x: number; y: number } } | null>(null);
  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    if (node.type === 'group') groupDrag.current = { name: node.id.slice(6), last: node.position };
  }, []);
  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    if (node.type !== 'group' || !groupDrag.current) return;
    const dx = node.position.x - groupDrag.current.last.x;
    const dy = node.position.y - groupDrag.current.last.y;
    if (dx === 0 && dy === 0) return;
    const name = groupDrag.current.name;
    setNodes((nds) => nds.map((n) =>
      n.type === 'table' && (n.data as any).group === name
        ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
        : n));
    groupDrag.current.last = node.position;
  }, [setNodes]);
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === 'group') {
      const name = node.id.slice(6);
      const updated = { ...positions };
      for (const n of nodes) if (n.type === 'table' && (n.data as any).group === name) updated[n.id] = n.position;
      onPositionsChange(updated);
      groupDrag.current = null;
    } else {
      onPositionsChange({ ...positions, [node.id]: node.position });
    }
  }, [nodes, positions, onPositionsChange]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) {
      if (e.type === 'lineage') onRemoveLineage(e.source, e.target);
      else {
        const ep = e.data?.endpoints as RefEndpoints | undefined;
        if (ep) onRemoveRef(ep.fromTbl, ep.fromCol, ep.toTbl, ep.toCol);
      }
    }
  }, [onRemoveLineage, onRemoveRef]);

  const onEdgeUpdate = useCallback((oldEdge: Edge, c: Connection) => {
    if (lineageMode || oldEdge.type !== 'relation') return;
    const ep = oldEdge.data?.endpoints as RefEndpoints | undefined;
    if (!ep || !c.source || !c.target) return;
    const fromCol = stripHandle(c.sourceHandle); const toCol = stripHandle(c.targetHandle);
    if (!fromCol || !toCol) return;
    onRemoveRef(ep.fromTbl, ep.fromCol, ep.toTbl, ep.toCol);
    onCreateRef(c.source, fromCol, c.target, toCol);
  }, [lineageMode, onRemoveRef, onCreateRef]);

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
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectStart={lineageMode ? () => setConnecting(true) : undefined}
        onConnectEnd={() => setConnecting(false)}
        isValidConnection={isValidConnection}
        connectionMode={lineageMode ? ConnectionMode.Loose : ConnectionMode.Strict}
        connectionRadius={lineageMode ? 56 : 24}
        nodesConnectable
        connectOnClick={false}
        edgesUpdatable={!lineageMode}
        className={
          lineageMode
            ? `canvas--lineage-mode${connecting ? ' canvas--lineage-connecting' : ''}`
            : undefined
        }
        onEdgesDelete={onEdgesDelete}
        onEdgeUpdate={onEdgeUpdate}
        deleteKeyCode={['Delete', 'Backspace']}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeClick={(_, n) => {
          if (n.type === 'table') selectTable(n.id);
          else if (n.type === 'group') selectGroup(n.id.replace(/^group:/, ''));
        }}
        onPaneClick={() => { selectColumn(null); selectTable(null); selectGroup(null); }}
        fitView
        minZoom={0.1}
      >
        <FocusTableHelper tableId={focusTableId} onDone={onFocusTableDone} />
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </>
  );
}
