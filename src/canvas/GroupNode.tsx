// Caixa de TableGroup: rótulo é a alça (move o grupo) + botão de colapsar.
type GroupData = { label: string; collapsed: boolean; count: number; onToggle?: () => void };

export function GroupNode({ data }: { data: GroupData }) {
  return (
    <div className={`group-node ${data.collapsed ? 'is-collapsed' : ''}`}>
      <span className="group-node__label">
        <button
          className="group-node__toggle"
          title={data.collapsed ? 'Expandir' : 'Colapsar'}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle?.();
          }}
        >
          {data.collapsed ? '▸' : '▾'}
        </button>
        {data.label}
        {data.collapsed ? ` · ${data.count} tabela(s)` : ''}
      </span>
    </div>
  );
}
