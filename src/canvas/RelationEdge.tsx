import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from 'reactflow';
import type { Cardinality } from '../dsl/parse';

export type RelationEdgeData = {
  fromRel: Cardinality;
  toRel: Cardinality;
  highlighted?: boolean;
  dimmed?: boolean;
  muted?: boolean;
  /** Foco por coluna: mesma espessura de aresta selecionada, sem neon. */
  emphasized?: boolean;
  onRemove?: () => void;
};

const markerFor = (rel: Cardinality) => (rel === '*' ? 'url(#cf-many)' : 'url(#cf-one)');

export function RelationEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<RelationEdgeData>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const active = selected || data?.highlighted;
  const emphasis = selected || data?.emphasized;

  return (
    <>
      <BaseEdge
        path={path}
        markerStart={markerFor(data?.fromRel ?? '*')}
        markerEnd={markerFor(data?.toRel ?? '1')}
        style={{
          stroke: active ? 'var(--brand-green)' : 'var(--brand-navy)',
          strokeWidth: emphasis ? 3 : data?.highlighted ? 2.5 : 1.5,
        }}
      />
      {selected && data?.onRemove && (
        <EdgeLabelRenderer>
          <button
            className="edge-delete"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title="Remover relação"
            onClick={(e) => {
              e.stopPropagation();
              data.onRemove?.();
            }}
          >
            ✕
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
