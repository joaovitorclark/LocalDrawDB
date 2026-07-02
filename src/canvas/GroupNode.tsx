// Caixa de TableGroup: drag só na alça (rótulo + bordas); interior permite pan.
// Cor do grupo (--group-color): aplicada à borda tracejada e ao rótulo.
import { memo, useState, type CSSProperties } from 'react';
import { useCanvasActions, TABLE_COLORS } from './actions';

type GroupData = { label: string; collapsed: boolean; count: number; color?: string; onToggle?: () => void };

function GroupNodeImpl({ data }: { data: GroupData }) {
  const actions = useCanvasActions();
  const [palette, setPalette] = useState(false);
  const style = data.color ? ({ '--group-color': data.color } as CSSProperties) : undefined;
  return (
    <div className={`group-node ${data.collapsed ? 'is-collapsed' : ''}`} style={style}>
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
        <button
          className="group-node__color nodrag nopan"
          title="Cor do grupo"
          onClick={(e) => {
            e.stopPropagation();
            setPalette((p) => !p);
          }}
        >
          ◑
        </button>
        {palette && (
          <div className="color-palette color-palette--group nodrag nopan" onClick={(e) => e.stopPropagation()}>
            <div className="color-palette__row">
              {TABLE_COLORS.map((c) => (
                <button
                  key={c}
                  style={{ background: c }}
                  onClick={() => {
                    actions.onSetGroupColor(data.label, c);
                    setPalette(false);
                  }}
                />
              ))}
              <button
                className="color-reset"
                title="Sem cor"
                onClick={() => {
                  actions.onSetGroupColor(data.label, null);
                  setPalette(false);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </span>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
