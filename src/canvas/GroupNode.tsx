// Caixa visual de um TableGroup (renderizada atrás das tabelas, sem interação).
export function GroupNode({ data }: { data: { label: string } }) {
  return (
    <div className="group-node">
      <span className="group-node__label">{data.label}</span>
    </div>
  );
}
