import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from 'reactflow';
import type { Cardinality } from '../dsl/parse';

export type RelationEdgeData = {
  fromRel: Cardinality; // cardinalidade no lado source
  toRel: Cardinality; // cardinalidade no lado target
  highlighted?: boolean;
  onRemove?: () => void;
};

const markerFor = (rel: Cardinality) => (rel === '*' ? 'url(#cf-many)' : 'url(#cf-one)');

// Aresta com marcadores pé-de-galinha, estilo de seleção e botão ✕ (drawio-style).
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

  return (
    <>
      <BaseEdge
        path={path}
        markerStart={markerFor(data?.fromRel ?? '*')}
        markerEnd={markerFor(data?.toRel ?? '1')}
        style={{
          stroke: active ? 'var(--brand-green)' : 'var(--brand-navy)',
          strokeWidth: selected ? 3 : data?.highlighted ? 2.5 : 1.5,
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
