// Arestas do canvas: rebuild estrutural separado do highlight (Fase 3 perf).
import { useEffect, useRef } from 'react';
import type { Edge } from 'reactflow';
import type { ParseResult, ParsedFieldLineage } from '../../dsl/parse';
import type { LineageLink } from '../../api';
import {
  EXTERNAL_SOURCE_HANDLE,
  EXTERNAL_TARGET_HANDLE,
  externalSourceHandle,
  externalTargetHandle,
  type AggregatedCrossLink,
} from '../pageFilter';
import { edgeClassForTier, edgeFocusTier } from '../edgeFocus';
import { DEFAULT_LINEAGE_SOURCE, DEFAULT_LINEAGE_TARGET, isLineageHandle, pickLineageHandles } from '../lineageHandles';

type RefEndpoints = { fromTbl: string; fromCol: string; toTbl: string; toCol: string };

type FocusFieldMapping = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
} | null;

type SelectedColumn = { table: string; column: string } | null;

export type EdgeBuildInput = {
  parsed: ParseResult;
  aggregatedCrossLinks: AggregatedCrossLink[];
  lineage: LineageLink[];
  lineageFields: ParsedFieldLineage[];
  positions: Record<string, { x: number; y: number }>;
  relationsVisible: boolean;
  showLineageEdges: boolean;
  fieldLineageVisible: boolean;
  focusTables: string[];
  focusedFieldMapping: FocusFieldMapping;
  selectedColumn: SelectedColumn;
  onRemoveRef: (a: string, ac: string, b: string, bc: string) => void;
  onRemoveLineage: (source: string, target: string) => void;
  onRemoveFieldLineage: (
    sourceTable: string, sourceColumn: string, targetTable: string, targetColumn: string,
  ) => void;
};

function mergeEdgeState(prev: Edge[], next: Edge[]): Edge[] {
  const prevById = new Map(prev.map((e) => [e.id, e] as const));
  return next.map((e) => {
    const prior = prevById.get(e.id);
    if (!prior) return { ...e, interactionWidth: e.interactionWidth ?? 24 };
    return {
      ...e,
      selected: e.selected ?? prior.selected,
      sourceHandle: prior.sourceHandle ?? e.sourceHandle,
      targetHandle: prior.targetHandle ?? e.targetHandle,
      interactionWidth: e.interactionWidth ?? 24,
    };
  });
}

function buildStructuralEdges(
  input: EdgeBuildInput,
  prevLin: Map<string, Edge>,
  onRemoveRef: EdgeBuildInput['onRemoveRef'],
  onRemoveLineage: EdgeBuildInput['onRemoveLineage'],
  onRemoveFieldLineage: EdgeBuildInput['onRemoveFieldLineage'],
): Edge[] {
  const {
    parsed, aggregatedCrossLinks, lineage, lineageFields, positions,
    relationsVisible, showLineageEdges, fieldLineageVisible,
    focusTables, focusedFieldMapping, selectedColumn,
  } = input;

  const relEdges: Edge[] = relationsVisible
    ? [
        ...parsed.refs.map((r) => {
          const endpoints: RefEndpoints = { fromTbl: r.source, fromCol: r.fromCol, toTbl: r.target, toCol: r.toCol };
          return {
            id: r.id,
            source: r.source,
            target: r.target,
            sourceHandle: `s:${r.fromCol}`,
            targetHandle: `t:${r.toCol}`,
            type: 'relation',
            interactionWidth: 24,
            data: {
              fromRel: r.fromRel,
              toRel: r.toRel,
              endpoints,
              onRemove: () => onRemoveRef(r.source, r.fromCol, r.target, r.toCol),
            },
          };
        }),
        ...aggregatedCrossLinks.map((link) => {
          if (link.direction === 'out') {
            return {
              id: link.id,
              source: link.visibleTable,
              target: link.stubId,
              sourceHandle: externalSourceHandle(link.stubId),
              targetHandle: EXTERNAL_TARGET_HANDLE,
              type: 'relation',
              className: 'edge--external',
              interactionWidth: 12,
              data: {
                fromRel: '1' as const,
                toRel: '1' as const,
                externalSummary: true,
                linkCount: link.count,
                stubLabel: link.stubLabel,
                externalDetails: link.refs.map((r) => r.remoteLabel),
              },
            };
          }
          return {
            id: link.id,
            source: link.stubId,
            target: link.visibleTable,
            sourceHandle: EXTERNAL_SOURCE_HANDLE,
            targetHandle: externalTargetHandle(link.stubId),
            type: 'relation',
            className: 'edge--external',
            interactionWidth: 12,
            data: {
              fromRel: '1' as const,
              toRel: '1' as const,
              externalSummary: true,
              linkCount: link.count,
              stubLabel: link.stubLabel,
              externalDetails: link.refs.map((r) => r.remoteLabel),
            },
          };
        }),
      ]
    : [];

  const tableById = new Map(parsed.tables.map((t) => [t.id, t] as const));
  const linEdges: Edge[] = showLineageEdges
    ? lineage.map((l) => {
        const id = `lin:${l.source}->${l.target}`;
        const prior = prevLin.get(id);
        const edge: Edge = {
          id,
          source: l.source,
          target: l.target,
          type: 'lineage',
          interactionWidth: 24,
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
  const focusedEdgeId = focusedFieldMapping
    ? `fl:${focusedFieldMapping.sourceTable}.${focusedFieldMapping.sourceColumn}->${focusedFieldMapping.targetTable}.${focusedFieldMapping.targetColumn}`
    : null;
  const fieldEdges: Edge[] = [];
  if (fieldLineageVisible && (focusSet.size > 0 || focusedEdgeId || selectedColumn)) {
    for (const m of lineageFields) {
      const id = `fl:${m.sourceTable}.${m.sourceColumn}->${m.targetTable}.${m.targetColumn}`;
      const visible = selectedColumn
        ? m.targetTable === selectedColumn.table || m.sourceTable === selectedColumn.table
        : focusSet.has(m.targetTable) ||
          focusSet.has(m.sourceTable) ||
          id === focusedEdgeId;
      if (!visible) continue;
      fieldEdges.push({
        id,
        source: m.sourceTable,
        target: m.targetTable,
        sourceHandle: `fl:s:${m.sourceColumn}`,
        targetHandle: `fl:t:${m.targetColumn}`,
        type: 'fieldLineage',
        selected: id === focusedEdgeId,
        interactionWidth: 24,
        data: {
          label: `${m.sourceColumn}→${m.targetColumn}`,
          mapping: {
            sourceTable: m.sourceTable,
            sourceColumn: m.sourceColumn,
            targetTable: m.targetTable,
            targetColumn: m.targetColumn,
          },
          onRemove: () =>
            onRemoveFieldLineage(m.sourceTable, m.sourceColumn, m.targetTable, m.targetColumn),
        },
      });
    }
  }

  return [...relEdges, ...linEdges, ...fieldEdges];
}

function edgeTouchesFocus(
  e: Edge,
  focusTables: string[],
  aggregatedCrossLinks: AggregatedCrossLink[],
): boolean {
  if (e.type === 'fieldLineage') {
    return !!e.selected || focusTables.includes(e.source) || focusTables.includes(e.target);
  }
  if (e.className?.includes('edge--external')) {
    return (
      focusTables.includes(e.source) ||
      focusTables.includes(e.target) ||
      aggregatedCrossLinks.some(
        (link) =>
          link.id === e.id &&
          (focusTables.includes(link.visibleTable) || focusTables.includes(link.stubId)),
      )
    );
  }
  return focusTables.some((ft) => e.source === ft || e.target === ft);
}

function applyEdgeHighlight(
  e: Edge,
  touches: boolean,
  focusActive: boolean,
  selectedColumn: SelectedColumn,
): Edge {
  if (selectedColumn) {
    const tier = edgeFocusTier(e, selectedColumn);
    const active = e.selected || tier === 'primary';
    const highlightCls = edgeClassForTier(e, tier, !!e.selected);
    return {
      ...e,
      animated: false,
      className: highlightCls,
      data: {
        ...e.data,
        highlighted: active,
        dimmed: tier === 'dimmed' && !e.selected,
        muted: tier === 'secondary' && !e.selected,
        emphasized: tier === 'primary' && !e.selected,
      },
    };
  }

  const active = e.selected || touches;
  const highlightCls =
    e.type === 'lineage'
      ? active
        ? 'edge--highlight edge--lineage'
        : 'edge--dimmed'
      : e.type === 'fieldLineage'
        ? active
          ? 'edge--highlight edge--field-lineage'
          : 'edge--dimmed'
        : active
          ? 'edge--highlight'
          : 'edge--dimmed';
  return {
    ...e,
    animated: active && e.type !== 'fieldLineage' && !e.selected,
    className: focusActive || e.selected ? highlightCls : undefined,
    data: {
      ...e.data,
      highlighted: focusActive || e.selected ? active : false,
      dimmed: focusActive || e.selected ? !active : false,
      emphasized: false,
    },
  };
}

function highlightPatchEqual(a: Edge, b: Edge): boolean {
  return (
    a.className === b.className &&
    a.animated === b.animated &&
    (a.data as { highlighted?: boolean })?.highlighted === (b.data as { highlighted?: boolean })?.highlighted &&
    (a.data as { dimmed?: boolean })?.dimmed === (b.data as { dimmed?: boolean })?.dimmed &&
    (a.data as { muted?: boolean })?.muted === (b.data as { muted?: boolean })?.muted &&
    (a.data as { emphasized?: boolean })?.emphasized === (b.data as { emphasized?: boolean })?.emphasized
  );
}

export function useCanvasEdges(
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void,
  input: EdgeBuildInput,
): void {
  const inputRef = useRef(input);
  inputRef.current = input;

  const fieldFocusKey = input.fieldLineageVisible
    ? [
        input.focusTables.join('\u0000'),
        input.focusedFieldMapping?.sourceTable ?? '',
        input.focusedFieldMapping?.sourceColumn ?? '',
        input.focusedFieldMapping?.targetTable ?? '',
        input.focusedFieldMapping?.targetColumn ?? '',
        input.selectedColumn?.table ?? '',
        input.selectedColumn?.column ?? '',
      ].join('\u0002')
    : '';

  const structureKey = [
    input.parsed.refs,
    input.aggregatedCrossLinks,
    input.parsed.tables,
    input.lineage,
    input.lineageFields,
    input.relationsVisible,
    input.showLineageEdges,
    input.fieldLineageVisible,
    input.positions,
    fieldFocusKey,
  ].join('\u0001');

  // Rebuild estrutural (refs, linhagem, L2 visível) — sem highlight.
  useEffect(() => {
    const cur = inputRef.current;
    setEdges((prev) => {
      const prevLin = new Map(
        prev.filter((e) => e.type === 'lineage').map((e) => [e.id, e] as const),
      );
      const built = mergeEdgeState(
        prev,
        buildStructuralEdges(cur, prevLin, cur.onRemoveRef, cur.onRemoveLineage, cur.onRemoveFieldLineage),
      );
      return built;
    });
  }, [structureKey, setEdges]);

  const highlightKey = [
    input.focusTables.join('\u0000'),
    input.selectedColumn?.table ?? '',
    input.selectedColumn?.column ?? '',
  ].join('\u0001');

  // Highlight/de-emphasis: patch leve, sem reconstruir arestas do parsed.
  useEffect(() => {
    const cur = inputRef.current;
    const focusActive = cur.focusTables.length > 0;
    setEdges((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (e.type !== 'relation' && e.type !== 'lineage' && e.type !== 'fieldLineage') return e;
        const touches = edgeTouchesFocus(e, cur.focusTables, cur.aggregatedCrossLinks);
        const patched = applyEdgeHighlight(e, touches, focusActive, cur.selectedColumn);
        if (highlightPatchEqual(e, patched)) return e;
        changed = true;
        return patched;
      });
      return changed ? next : prev;
    });
  }, [highlightKey, structureKey, setEdges, input.aggregatedCrossLinks]);
}
