import { BaseEdge, getSmoothStepPath, type EdgeProps } from 'reactflow';

export type FieldLineageEdgeData = {
  highlighted?: boolean;
  dimmed?: boolean;
  label?: string;
};

/** Aresta fina coluna→coluna (só quando toggle ativo + tabela selecionada). */
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
        stroke: active ? '#0d9488' : '#5eead4',
        strokeWidth: active ? 2 : 1.25,
        strokeDasharray: '3 3',
        opacity: dimmed ? 0.15 : 0.85,
      }}
    />
  );
}
