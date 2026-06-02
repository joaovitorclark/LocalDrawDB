import type { Layer } from '../api';
import { useInteraction } from '../store/interaction';

// Seletor de camadas (canto superior direito) + controles de linhagem.
export function LayersPanel({ layers, onAddLayer }: { layers: Layer[]; onAddLayer: (n: string, c: string) => void }) {
  const hiddenLayers = useInteraction((s) => s.hiddenLayers);
  const toggleLayer = useInteraction((s) => s.toggleLayer);
  const layerDimMode = useInteraction((s) => s.layerDimMode);
  const toggleDimMode = useInteraction((s) => s.toggleDimMode);
  const lineageVisible = useInteraction((s) => s.lineageVisible);
  const toggleLineageVisible = useInteraction((s) => s.toggleLineageVisible);
  const lineageMode = useInteraction((s) => s.lineageMode);
  const toggleLineageMode = useInteraction((s) => s.toggleLineageMode);

  return (
    <div className="layers-panel">
      <div className="layers-panel__title">Camadas</div>
      {layers.map((l) => (
        <label key={l.id} className="layers-panel__row">
          <input type="checkbox" checked={!hiddenLayers.has(l.id)} onChange={() => toggleLayer(l.id)} />
          <span className="layer-dot" style={{ background: l.color }} />
          {l.name}
        </label>
      ))}
      <button className="layers-panel__add" onClick={() => {
        const name = prompt('Nome da nova camada:');
        if (!name) return;
        const color = prompt('Cor (hex):', '#6b7280') || '#6b7280';
        onAddLayer(name.trim(), color.trim());
      }}>+ camada</button>

      <div className="layers-panel__sep" />
      <label className="layers-panel__row">
        <input type="checkbox" checked={layerDimMode} onChange={toggleDimMode} />
        Esmaecer (em vez de esconder)
      </label>

      <div className="layers-panel__sep" />
      <div className="layers-panel__title">Linhagem</div>
      <label className="layers-panel__row">
        <input type="checkbox" checked={lineageVisible} onChange={toggleLineageVisible} />
        Mostrar linhagem
      </label>
      <label className={`layers-panel__row ${lineageMode ? 'is-active' : ''}`}>
        <input type="checkbox" checked={lineageMode} onChange={toggleLineageMode} />
        Modo linhagem (arrastar tabela→tabela)
      </label>
    </div>
  );
}
