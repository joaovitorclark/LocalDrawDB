// Caixa de TableGroup: drag só na alça (rótulo + bordas); interior permite pan.
type GroupData = { label: string; collapsed: boolean; count: number; onToggle?: () => void };

export function GroupNode({ data }: { data: GroupData }) {
  return (
    <div className={`group-node ${data.collapsed ? 'is-collapsed' : ''}`}>
      {!data.collapsed && (
        <>
          <div className="group-node__edge group-node__edge--top group-node__drag-handle" />
          <div className="group-node__edge group-node__edge--bottom group-node__drag-handle" />
          <div className="group-node__edge group-node__edge--left group-node__drag-handle" />
          <div className="group-node__edge group-node__edge--right group-node__drag-handle" />
        </>
      )}
      <span className="group-node__label group-node__drag-handle">
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
