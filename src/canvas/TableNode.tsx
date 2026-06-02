import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { TableView } from '../dsl/parse';
import { useInteraction } from '../store/interaction';
import { useCanvasActions, TABLE_COLORS } from './actions';

// Nó customizado: tabela com colunas, handles por coluna (drag-to-create), cor e
// edição inline (renomear coluna, adicionar coluna).
export function TableNode({ data }: { data: TableView }) {
  const actions = useCanvasActions();
  const selected = useInteraction((s) => s.selectedColumn);
  const [palette, setPalette] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const color = actions.colorOf(data.id) ?? '#13284b';

  const startEdit = (col: string) => {
    setEditing(col);
    setDraft(col);
  };
  const commitEdit = (oldName: string) => {
    const v = draft.trim();
    if (v && v !== oldName) actions.onRenameColumn(data.id, oldName, v);
    setEditing(null);
  };

  return (
    <div className="table-node">
      <div className="table-node__header" style={{ background: color }}>
        <span
          className="table-node__title"
          title="Duplo-clique para renomear a tabela"
          onDoubleClick={(e) => {
            e.stopPropagation();
            const nv = prompt('Novo nome da tabela (schema.tabela):', data.id);
            if (nv && nv.trim()) actions.onRenameTable(data.id, nv.trim());
          }}
        >
          {data.schema && <span className="table-node__schema">{data.schema}.</span>}
          {data.name}
        </span>
        <button
          className="table-node__color"
          title="Cor da tabela"
          onClick={(e) => {
            e.stopPropagation();
            setPalette((p) => !p);
          }}
        >
          ●
        </button>
        {palette && (
          <div className="color-palette" onClick={(e) => e.stopPropagation()}>
            {TABLE_COLORS.map((c) => (
              <button
                key={c}
                style={{ background: c }}
                onClick={() => {
                  actions.onSetColor(data.id, c);
                  setPalette(false);
                }}
              />
            ))}
            <button className="color-reset" onClick={() => { actions.onSetColor(data.id, null); setPalette(false); }}>
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="table-node__cols">
        {data.columns.map((c) => {
          const isSel = selected?.table === data.id && selected?.column === c.name;
          return (
            <div
              key={c.name}
              className={`col-row ${c.pk ? 'is-pk' : ''} ${isSel ? 'is-selected' : ''}`}
              onClick={() => actions.onSelectColumn(data.id, c.name)}
            >
              <Handle type="target" position={Position.Left} id={`t:${c.name}`} className="col-handle" />
              {editing === c.name ? (
                <input
                  className="col-edit"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitEdit(c.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(c.name);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="col-name" onDoubleClick={(e) => { e.stopPropagation(); startEdit(c.name); }}>
                  {c.pk ? '🔑 ' : ''}
                  {c.name}
                  {c.notNull ? <span className="col-nn">NN</span> : null}
                </span>
              )}
              <span className="col-type">{c.type}</span>
              <Handle type="source" position={Position.Right} id={`s:${c.name}`} className="col-handle" />
            </div>
          );
        })}
      </div>

      <button
        className="col-add"
        onClick={(e) => {
          e.stopPropagation();
          actions.onAddColumn(data.id);
        }}
      >
        + coluna
      </button>
    </div>
  );
}
