import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from 'reactflow';
import { useInteraction } from '../store/interaction';
import { useCanvasActions, TABLE_COLORS, type TableNodeData } from './actions';
import { LineagePorts } from './LineagePorts';
import { TableInfoPopover } from './TableInfoPopover';

// Nó de tabela: colunas + FK por handle, ou cartão compacto + portas de linhagem (draw.io).
// Memoizado: `data` (incl. cor/meta pré-computadas) só muda quando o conteúdo da própria
// tabela muda, então editar uma tabela não re-renderiza as demais.
function TableNodeImpl({ data }: { data: TableNodeData }) {
  const actions = useCanvasActions();
  // Assinatura escopada à própria tabela: selecionar coluna em outra tabela não
  // dispara re-render aqui (retorna sempre null).
  const selectedColumn = useInteraction((s) =>
    s.selectedColumn && s.selectedColumn.table === data.id ? s.selectedColumn.column : null,
  );
  const lineageMode = useInteraction((s) => s.lineageMode);
  const lineageVisible = useInteraction((s) => s.lineageVisible);
  const fieldLineageVisible = useInteraction((s) => s.fieldLineageVisible);
  const showLineagePorts = lineageMode || lineageVisible;
  const [palette, setPalette] = useState(false);
  const [infoRect, setInfoRect] = useState<DOMRect | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const color = data.headerColor;
  const meta = data.meta;

  const commitEdit = (oldName: string) => {
    const v = draft.trim();
    if (v && v !== oldName) actions.onRenameColumn(data.id, oldName, v);
    setEditing(null);
  };

  return (
    <div
      className={`table-node-shell${lineageMode ? ' table-node-shell--lineage' : ''}${showLineagePorts ? ' table-node-shell--lineage-ports' : ''}`}
    >
      {showLineagePorts && <LineagePorts />}
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
              onMouseEnter={(e) => setInfoRect(e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => setInfoRect(null)}
            >
              ⓘ
              {infoRect &&
                createPortal(
                  <TableInfoPopover
                    meta={meta}
                    style={{
                      position: 'fixed',
                      top: infoRect.bottom + 4,
                      left: Math.min(infoRect.left, window.innerWidth - 280),
                    }}
                  />,
                  document.body,
                )}
            </span>
          )}
          <button
            type="button"
            className="table-node__delete"
            title="Apagar tabela"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Apagar tabela ${data.id} e refs relacionadas?`)) {
                actions.onRemoveTable(data.id);
              }
            }}
          >
            ×
          </button>
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
                const isSel = selectedColumn === c.name;
                return (
                  <div
                    key={c.name}
                    className={`col-row ${c.pk ? 'is-pk' : ''} ${isSel ? 'is-selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.altKey && actions.onGoToColumn) {
                        actions.onGoToColumn(data.id, c.name);
                        return;
                      }
                      actions.onSelectColumn(data.id, c.name);
                    }}
                  >
                    <Handle type="target" position={Position.Left} id={`t:${c.name}`} className="col-handle nodrag nopan" />
                    {fieldLineageVisible && (
                      <Handle
                        type="target"
                        position={Position.Left}
                        id={`fl:t:${c.name}`}
                        className="col-handle col-handle--field-lin nodrag nopan"
                      />
                    )}
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
                    <Handle type="source" position={Position.Right} id={`s:${c.name}`} className="col-handle nodrag nopan" />
                    {fieldLineageVisible && (
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`fl:s:${c.name}`}
                        className="col-handle col-handle--field-lin nodrag nopan"
                      />
                    )}
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
    </div>
  );
}

export const TableNode = memo(TableNodeImpl);
