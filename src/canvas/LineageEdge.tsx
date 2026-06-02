import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from 'reactflow';

export type LineageEdgeData = { onRemove?: () => void };

// Aresta de LINHAGEM (tabela derivada de outra) — distinta das de PK/FK: tracejada, roxa.
export function LineageEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected,
}: EdgeProps<LineageEdgeData>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8,
  });
  return (
    <>
      <BaseEdge
        path={path}
        style={{ stroke: '#8b5cf6', strokeWidth: selected ? 3 : 2, strokeDasharray: '6 4' }}
      />
      <EdgeLabelRenderer>
        <div
          className="lineage-label"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          ⟿ derivado de
          {selected && data?.onRemove && (
            <button className="edge-delete" title="Remover linhagem" onClick={(e) => { e.stopPropagation(); data.onRemove?.(); }}>✕</button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
