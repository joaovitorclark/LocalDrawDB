import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, ConnectionMode, SelectionMode, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type Node, type OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TableNode } from './TableNode';
import { RelationEdge } from './RelationEdge';
import { LineageEdge } from './LineageEdge';
import { FieldLineageEdge } from './FieldLineageEdge';
import { EdgeMarkers } from './EdgeMarkers';
import { GroupNode } from './GroupNode';
import { useCanvasNodes, useHoverHighlight, type NodeOpts, type Positions } from './hooks/useCanvasNodes';
import { useInteraction } from '../store/interaction';
import type { ParseResult, ParsedFieldLineage } from '../dsl/parse';
import type { LineageLink } from '../api';
import { DEFAULT_LINEAGE_SOURCE, DEFAULT_LINEAGE_TARGET, isLineageHandle, pickLineageHandles } from './lineageHandles';
import { diagramOverviewBounds, focusTableInView } from './focusTableView';
import { SelectionBar } from './SelectionBar';

const isMacOs = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);

const stripHandle = (h: string | null | undefined) => (h ? h.replace(/^[st]:/, '') : '');
const nodeTypes = { table: TableNode, group: GroupNode };
const edgeTypes = { relation: RelationEdge, lineage: LineageEdge, fieldLineage: FieldLineageEdge };

export type RefEndpoints = { fromTbl: string; fromCol: string; toTbl: string; toCol: string };

type Props = {
  parsed: ParseResult;
  positions: Positions;
  onPositionsChange: (p: Positions) => void;
  onCreateRef: (a: string, ac: string, b: string, bc: string) => void;
  onRemoveRef: (a: string, ac: string, b: string, bc: string) => void;
  onRemoveTable: (tableId: string) => void;
  onRemoveTables?: (tableIds: string[]) => void;
  staleWarning?: boolean;
  lineage: LineageLink[];
  lineageFields: ParsedFieldLineage[];
  onCreateLineage: (source: string, target: string) => void;
  onRemoveLineage: (source: string, target: string) => void;
  onRemoveFieldLineage: (
    sourceTable: string, sourceColumn: string, targetTable: string, targetColumn: string,
  ) => void;
  layerOf: (tableId: string) => string | undefined;
  collapsedGroups: string[];
  onToggleGroup: (name: string) => void;
  focusTableId?: string | null;
  /** Incrementa para repetir foco na mesma tabela (ex.: posição recém-atribuída). */
  focusNonce?: number;
  onFocusTableDone?: () => void;
  /** Incrementa após Organizar canvas para dar fitView. */
  fitViewTrigger?: number;
};

function fitDiagram(
  getNodes: () => Node[],
  fitBounds: ReturnType<typeof useReactFlow>['fitBounds'],
  duration = 0,
) {
  const bounds = diagramOverviewBounds(getNodes());
  if (!bounds) return false;
  fitBounds(bounds, { padding: 0.14, duration });
  return true;
}

function AutolayoutFitHelper({ trigger }: { trigger?: number }) {
  const { fitBounds, getNodes } = useReactFlow();
  useEffect(() => {
    if (!trigger) return;
    fitDiagram(getNodes, fitBounds, 200);
  }, [trigger, fitBounds, getNodes]);
  return null;
}

function InitialFitHelper({ tableCount }: { tableCount: number }) {
  const { fitBounds, getNodes } = useReactFlow();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || tableCount === 0) return;
    let cancelled = false;
    const tryFit = (attempt = 0) => {
      if (cancelled || done.current) return;
      if (fitDiagram(getNodes, fitBounds, 0)) {
        done.current = true;
        return;
      }
      if (attempt < 40) requestAnimationFrame(() => tryFit(attempt + 1));
    };
    requestAnimationFrame(() => tryFit());
    return () => {
      cancelled = true;
    };
  }, [tableCount, fitBounds, getNodes]);
  return null;
}

function FocusTableHelper({
  tableId,
  focusNonce,
  onDone,
}: {
  tableId: string | null | undefined;
  focusNonce?: number;
  onDone?: () => void;
}) {
  const { setCenter, getNode } = useReactFlow();
  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    const tryFocus = (attempt = 0) => {
      if (cancelled) return;
      if (focusTableInView(getNode, setCenter, tableId)) {
        onDone?.();
        return;
      }
      if (attempt < 40) requestAnimationFrame(() => tryFocus(attempt + 1));
      else onDone?.();
    };
    requestAnimationFrame(() => tryFocus());
    return () => {
      cancelled = true;
    };
  }, [tableId, focusNonce, setCenter, getNode, onDone]);
  return null;
}

export function Canvas(props: Props) {
  const { parsed, positions, onPositionsChange, onCreateRef, onRemoveRef, onRemoveTable, onRemoveTables,
    staleWarning, lineage, lineageFields, onCreateLineage, onRemoveLineage, onRemoveFieldLineage,
    layerOf, collapsedGroups, onToggleGroup, focusTableId, focusNonce, onFocusTableDone, fitViewTrigger } = props;
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const hovered = useInteraction((s) => s.hoveredTableId);
  const selectedTableIds = useInteraction((s) => s.selectedTableIds);
  const setSelectedTableIds = useInteraction((s) => s.setSelectedTableIds);
  const clearCanvasSelection = useInteraction((s) => s.clearCanvasSelection);
  const fieldLineageVisible = useInteraction((s) => s.fieldLineageVisible);
  const focusedFieldMapping = useInteraction((s) => s.focusedFieldMapping);
  const setHovered = useInteraction((s) => s.setHovered);
  const selectColumn = useInteraction((s) => s.selectColumn);
  const selectGroup = useInteraction((s) => s.selectGroup);
  const hiddenLayers = useInteraction((s) => s.hiddenLayers);
  const layerDimMode = useInteraction((s) => s.layerDimMode);
  const lineageMode = useInteraction((s) => s.lineageMode);
  const lineageVisible = useInteraction((s) => s.lineageVisible);
  const relationsVisible = useInteraction((s) => s.relationsVisible);
  const showLineage = lineageVisible || lineageMode;
  const [connecting, setConnecting] = useState(false);

  const focusTables = useMemo(() => {
    if (selectedTableIds.length) return selectedTableIds;
    if (hovered) return [hovered];
    return [];
  }, [selectedTableIds, hovered]);

  const related = useMemo(() => {
    if (!focusTables.length) return null;
    const set = new Set<string>(focusTables);
    for (const ft of focusTables) {
      if (!lineageMode) {
        for (const r of parsed.refs) {
          if (r.source === ft) set.add(r.target);
          if (r.target === ft) set.add(r.source);
        }
      }
      if (showLineage) {
        for (const l of lineage) {
          if (l.source === ft) set.add(l.target);
          if (l.target === ft) set.add(l.source);
        }
      }
    }
    return set;
  }, [focusTables, parsed.refs, lineage, lineageMode, showLineage]);
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

  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: OnSelectionChangeParams) => {
      const ids = selNodes.filter((n) => n.type === 'table').map((n) => n.id);
      setSelectedTableIds(ids);
    },
    [setSelectedTableIds],
  );

  // Arestas: PK/FK (relation) — ocultas no modo linhagem; linhagem só com modo ativo.
  useEffect(() => {
    setEdges((prev) => {
      const prevLin = new Map(
        prev.filter((e) => e.type === 'lineage').map((e) => [e.id, e] as const),
      );
      const relEdges: Edge[] = relationsVisible
        ? parsed.refs.map((r) => {
            const endpoints: RefEndpoints = { fromTbl: r.source, fromCol: r.fromCol, toTbl: r.target, toCol: r.toCol };
            return {
              id: r.id, source: r.source, target: r.target,
              sourceHandle: `s:${r.fromCol}`, targetHandle: `t:${r.toCol}`,
              type: 'relation',
              data: { fromRel: r.fromRel, toRel: r.toRel, endpoints, onRemove: () => onRemoveRef(r.source, r.fromCol, r.target, r.toCol) },
            };
          })
        : [];
      const tableById = new Map(parsed.tables.map((t) => [t.id, t] as const));
      const linEdges: Edge[] = showLineage
        ? lineage.map((l) => {
            const id = `lin:${l.source}->${l.target}`;
            const prior = prevLin.get(id);
            const edge: Edge = {
              id, source: l.source, target: l.target, type: 'lineage',
              data: { onRemove: () => onRemoveLineage(l.source, l.target) },
            };
            if (prior?.sourceHandle && prior?.targetHandle && isLineageHandle(prior.sourceHandle)) {
              edge.sourceHandle = prior.sourceHandle;
              edge.targetHandle = prior.targetHandle;
            } else {
              const sp = positions[l.source];
              const tp = positions[l.target];
              const srcTable = tableById.get(l.source);
              const tgtTable = tableById.get(l.target);
              const handles =
                sp && tp
                  ? pickLineageHandles(sp, tp, srcTable, tgtTable)
                  : { sourceHandle: DEFAULT_LINEAGE_SOURCE, targetHandle: DEFAULT_LINEAGE_TARGET };
              edge.sourceHandle = handles.sourceHandle;
              edge.targetHandle = handles.targetHandle;
            }
            return edge;
          })
        : [];

      const focusSet = new Set(focusTables);
      const fieldEdges: Edge[] = [];
      if (fieldLineageVisible && focusSet.size > 0) {
        for (const m of lineageFields) {
          const inFocus =
            focusSet.has(m.targetTable) ||
            focusSet.has(m.sourceTable) ||
            (focusedFieldMapping &&
              m.sourceTable === focusedFieldMapping.sourceTable &&
              m.sourceColumn === focusedFieldMapping.sourceColumn &&
              m.targetTable === focusedFieldMapping.targetTable &&
              m.targetColumn === focusedFieldMapping.targetColumn);
          if (!inFocus) continue;
          const id = `fl:${m.sourceTable}.${m.sourceColumn}->${m.targetTable}.${m.targetColumn}`;
          fieldEdges.push({
            id,
            source: m.sourceTable,
            target: m.targetTable,
            sourceHandle: `fl:s:${m.sourceColumn}`,
            targetHandle: `fl:t:${m.targetColumn}`,
            type: 'fieldLineage',
            data: {
              label: `${m.sourceColumn}→${m.targetColumn}`,
              onRemove: () =>
                onRemoveFieldLineage(m.sourceTable, m.sourceColumn, m.targetTable, m.targetColumn),
            },
          });
        }
      }

      return [...relEdges, ...linEdges, ...fieldEdges];
    });
  }, [
    parsed.refs, parsed.tables, lineage, lineageFields, relationsVisible, showLineage, fieldLineageVisible,
    focusTables, focusedFieldMapping, positions, setEdges, onRemoveRef, onRemoveLineage,
    onRemoveFieldLineage,
  ]);

  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        if (e.type !== 'relation' && e.type !== 'lineage' && e.type !== 'fieldLineage') return e;
        if (!focusTables.length) {
          return {
            ...e,
            animated: false,
            className: undefined,
            data: { ...e.data, highlighted: false, dimmed: false },
          };
        }
        const touches =
          e.type === 'fieldLineage'
            ? focusTables.includes(e.source) || focusTables.includes(e.target)
            : focusTables.some((ft) => e.source === ft || e.target === ft);
        const highlightCls =
          e.type === 'lineage'
            ? touches
              ? 'edge--highlight edge--lineage'
              : 'edge--dimmed'
            : e.type === 'fieldLineage'
              ? touches
                ? 'edge--highlight edge--field-lineage'
                : 'edge--dimmed'
              : touches
                ? 'edge--highlight'
                : 'edge--dimmed';
        return {
          ...e,
          animated: touches && e.type !== 'fieldLineage',
          className: highlightCls,
          data: { ...e.data, highlighted: touches, dimmed: !touches },
        };
      }),
    );
  }, [focusTables, setEdges]);

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
              const srcTable = parsed.tables.find((t) => t.id === c.source);
              const tgtTable = parsed.tables.find((t) => t.id === c.target);
              return sp && tp
                ? pickLineageHandles(sp, tp, srcTable, tgtTable).sourceHandle
                : DEFAULT_LINEAGE_SOURCE;
            })();
      const targetHandle =
        c.targetHandle && isLineageHandle(c.targetHandle)
          ? c.targetHandle
          : (() => {
              const sp = positions[c.source];
              const tp = positions[c.target];
              const srcTable = parsed.tables.find((t) => t.id === c.source);
              const tgtTable = parsed.tables.find((t) => t.id === c.target);
              return sp && tp
                ? pickLineageHandles(sp, tp, srcTable, tgtTable).targetHandle
                : DEFAULT_LINEAGE_TARGET;
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
  }, [lineageMode, onCreateLineage, onCreateRef, onRemoveLineage, parsed.tables, positions, setEdges]);

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
      return;
    }
    if (node.type !== 'table') return;
    const selectedIds = new Set(nodes.filter((n) => n.selected && n.type === 'table').map((n) => n.id));
    if (selectedIds.size > 1) {
      const updated = { ...positions };
      for (const n of nodes) {
        if (n.type === 'table' && selectedIds.has(n.id)) updated[n.id] = n.position;
      }
      onPositionsChange(updated);
    } else {
      onPositionsChange({ ...positions, [node.id]: node.position });
    }
  }, [nodes, positions, onPositionsChange]);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const tableIds = deleted.filter((n) => n.type === 'table').map((n) => n.id);
      if (!tableIds.length) return;
      if (tableIds.length === 1) onRemoveTable(tableIds[0]);
      else onRemoveTables?.(tableIds);
    },
    [onRemoveTable, onRemoveTables],
  );

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) {
      if (e.type === 'lineage') onRemoveLineage(e.source, e.target);
      else if (e.type === 'fieldLineage') (e.data as { onRemove?: () => void })?.onRemove?.();
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
    <div className="canvas-wrap">
      {staleWarning && (
        <div className="canvas-stale-banner" role="status">
          Canvas mostra último modelo válido — corrija o DBML no editor
        </div>
      )}
      <SelectionBar onRemoveTables={onRemoveTables} />
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={onNodesDelete}
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
        onNodeMouseEnter={(_, n) => { if (n.type === 'table') setHovered(n.id); }}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeClick={(_, n) => {
          if (n.type === 'group') selectGroup(n.id.replace(/^group:/, ''));
        }}
        onPaneClick={() => { selectColumn(null); clearCanvasSelection(); }}
        onSelectionChange={onSelectionChange}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={isMacOs() ? 'Meta' : 'Control'}
        elementsSelectable
        minZoom={0.25}
      >
        <InitialFitHelper tableCount={parsed.tables.length} />
        <AutolayoutFitHelper trigger={fitViewTrigger} />
        <FocusTableHelper tableId={focusTableId} focusNonce={focusNonce} onDone={onFocusTableDone} />
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
