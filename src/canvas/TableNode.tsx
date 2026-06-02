import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { TableView } from '../dsl/parse';
import { useInteraction } from '../store/interaction';
import { useCanvasActions, TABLE_COLORS } from './actions';
import { TableInfoPopover } from './TableInfoPopover';

// Nó customizado: tabela com colunas, handles por coluna (drag-to-create / linhagem),
// cor (override ou por camada), atribuição de camada, edição inline e ícone ⓘ.
export function TableNode({ data }: { data: TableView }) {
  const actions = useCanvasActions();
  const selected = useInteraction((s) => s.selectedColumn);
  const [palette, setPalette] = useState(false);
  const [info, setInfo] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const color = actions.colorOf(data.id) ?? actions.layerColorOf(actions.layerOf(data.id)) ?? '#13284b';
  const meta = actions.tableMeta(data.id);

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
        {meta.has && (
          <span
            className="table-node__info"
            onMouseEnter={() => setInfo(true)}
            onMouseLeave={() => setInfo(false)}
          >
            ⓘ
            {info && <TableInfoPopover meta={meta} />}
          </span>
        )}
        <button
          className="table-node__color"
          title="Cor / camada da tabela"
          onClick={(e) => {
            e.stopPropagation();
            setPalette((p) => !p);
          }}
        >
          ●
        </button>
        {palette && (
          <div className="color-palette" onClick={(e) => e.stopPropagation()}>
            <div className="color-palette__row">
              {TABLE_COLORS.map((c) => (
                <button key={c} style={{ background: c }} onClick={() => { actions.onSetColor(data.id, c); setPalette(false); }} />
              ))}
              <button className="color-reset" title="Sem cor (usar camada)" onClick={() => { actions.onSetColor(data.id, null); setPalette(false); }}>✕</button>
            </div>
            <div className="color-palette__layers">
              {actions.layers.map((l) => (
                <button key={l.id} className="layer-pick" onClick={() => { actions.onSetLayer(data.id, l.id); setPalette(false); }}>
                  <span className="layer-dot" style={{ background: l.color }} /> {l.name}
                </button>
              ))}
              <button className="layer-pick" onClick={() => { actions.onSetLayer(data.id, null); setPalette(false); }}>sem camada</button>
            </div>
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
                <span className="col-name" onDoubleClick={(e) => { e.stopPropagation(); setEditing(c.name); setDraft(c.name); }}>
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
