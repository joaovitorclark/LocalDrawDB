import { useMemo, useState } from 'react';
import type { Layer } from '../api';
import { useInteraction } from '../store/interaction';

type Props = {
  layers: Layer[];
  tables: { id: string }[];
  onAddLayer: (n: string, c: string) => void;
  onFocusTable: (tableId: string) => void;
  onAutolayout?: () => void;
};

export function LayersPanel({ layers, tables, onAddLayer, onFocusTable, onAutolayout }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [tableQuery, setTableQuery] = useState('');
  const hiddenLayers = useInteraction((s) => s.hiddenLayers);
  const toggleLayer = useInteraction((s) => s.toggleLayer);
  const layerDimMode = useInteraction((s) => s.layerDimMode);
  const toggleDimMode = useInteraction((s) => s.toggleDimMode);
  const lineageVisible = useInteraction((s) => s.lineageVisible);
  const toggleLineageVisible = useInteraction((s) => s.toggleLineageVisible);
  const lineageMode = useInteraction((s) => s.lineageMode);
  const toggleLineageMode = useInteraction((s) => s.toggleLineageMode);

  const filteredTables = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    const sorted = [...tables].sort((a, b) => a.id.localeCompare(b.id));
    if (!q) return sorted;
    return sorted.filter((t) => t.id.toLowerCase().includes(q));
  }, [tables, tableQuery]);

  return (
    <div className={`layers-panel ${collapsed ? 'is-collapsed' : ''}`}>
      <button className="layers-panel__collapse" onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? '◂ Painel' : '▸'}
      </button>
      {collapsed ? null : (
        <>
          <div className="layers-panel__title">Camadas</div>
          {layers.map((l) => (
            <label key={l.id} className="layers-panel__row">
              <input type="checkbox" checked={!hiddenLayers.has(l.id)} onChange={() => toggleLayer(l.id)} />
              <span className="layer-dot" style={{ background: l.color }} />
              {l.name}
            </label>
          ))}
          <button
            className="layers-panel__add"
            onClick={() => {
              const name = prompt('Nome da nova camada:');
              if (!name) return;
              const color = prompt('Cor (hex):', '#6b7280') || '#6b7280';
              onAddLayer(name.trim(), color.trim());
            }}
          >
            + camada
          </button>

          <div className="layers-panel__sep" />
          <label className="layers-panel__row">
            <input type="checkbox" checked={layerDimMode} onChange={toggleDimMode} />
            Esmaecer (em vez de esconder)
          </label>
          <label className="layers-panel__row">
            <input type="checkbox" checked={lineageVisible} onChange={toggleLineageVisible} />
            Mostrar linhagem
          </label>

          <div className="layers-panel__sep" />
          <div className="layers-panel__title">Tabelas</div>
          <input
            className="layers-panel__search"
            type="search"
            placeholder="Buscar tabela…"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
          />
          <ul className="layers-panel__tables">
            {filteredTables.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="layers-panel__table-btn"
                  onClick={() => onFocusTable(t.id)}
                  onDoubleClick={() => onFocusTable(t.id)}
                  title="Clique para ir à tabela no canvas"
                >
                  {t.id}
                </button>
              </li>
            ))}
            {filteredTables.length === 0 && (
              <li className="layers-panel__empty">Nenhuma tabela</li>
            )}
          </ul>
          {onAutolayout && (
            <button type="button" className="layers-panel__autolayout" onClick={onAutolayout}>
              Organizar canvas
            </button>
          )}

          <div className="layers-panel__sep" />
          <div className="layers-panel__title">Linhagem</div>
          <button
            type="button"
            className={`layers-panel__lineage-btn ${lineageMode ? 'is-active' : ''}`}
            onClick={toggleLineageMode}
            title="Editar linhagem nas bordas das tabelas"
          >
            {lineageMode ? '● Modo linhagem (ativo)' : '○ Modo linhagem'}
          </button>
          {lineageMode && (
            <p className="layers-panel__hint">
              Tabelas compactas. Arraste entre os pontos nas bordas. FKs ocultas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
