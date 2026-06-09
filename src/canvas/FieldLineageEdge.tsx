import { BaseEdge, getSmoothStepPath, type EdgeProps } from 'reactflow';

export type FieldLineageEdgeData = {
  highlighted?: boolean;
  dimmed?: boolean;
  label?: string;
};

/** Aresta L2 coluna→coluna: roxa tracejada (distinta da L1 contínua). */
export function FieldLineageEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps<FieldLineageEdgeData>) {
  const [path] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6,
  });
  const active = data?.highlighted;
  const dimmed = data?.dimmed;
  return (
    <BaseEdge
      path={path}
      style={{
        stroke: active ? '#7c3aed' : '#a78bfa',
        strokeWidth: active ? 2 : 1.25,
        strokeDasharray: '5 4',
        opacity: dimmed ? 0.15 : 0.9,
      }}
    />
  );
}
