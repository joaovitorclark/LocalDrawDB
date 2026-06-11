import { BaseEdge, getSmoothStepPath, type EdgeProps } from 'reactflow';

export type FieldLineageEdgeData = {
  highlighted?: boolean;
  dimmed?: boolean;
  muted?: boolean;
  /** Foco por coluna: linha contínua como aresta selecionada, sem glow. */
  emphasized?: boolean;
  label?: string;
  mapping?: {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
  };
};

/** Aresta L2 coluna→coluna: tracejada; selecionada fica contínua com glow neon. */
export function FieldLineageEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data,
}: EdgeProps<FieldLineageEdgeData>) {
  const [path] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6,
  });
  const active = selected || data?.highlighted;
  const dimmed = data?.dimmed && !selected;
  const solid = selected || !!data?.emphasized || (active && !data?.muted);
  return (
    <>
      {selected && (
        <BaseEdge
          path={path}
          className="field-lineage-edge__glow"
          style={{
            stroke: '#c084fc',
            strokeWidth: 10,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            opacity: 0.45,
          }}
        />
      )}
      <BaseEdge
        path={path}
        className={selected ? 'field-lineage-edge__core' : undefined}
        style={{
          stroke: selected ? '#f5d0fe' : active ? '#6d28d9' : '#a78bfa',
          strokeWidth: selected ? 3.5 : data?.emphasized ? 3.5 : active ? 2.25 : 1.25,
          strokeDasharray: solid ? undefined : '5 4',
          strokeLinecap: selected ? 'round' : undefined,
          strokeLinejoin: selected ? 'round' : undefined,
          opacity: dimmed ? 0.12 : selected ? 1 : 0.9,
        }}
      />
    </>
  );
}
