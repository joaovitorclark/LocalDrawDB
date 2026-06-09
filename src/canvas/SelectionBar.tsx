import { useInteraction } from '../store/interaction';

function shortName(id: string): string {
  const dot = id.lastIndexOf('.');
  return dot >= 0 ? id.slice(dot + 1) : id;
}

export function SelectionBar() {
  const selectedTableIds = useInteraction((s) => s.selectedTableIds);
  const setSelectedTableIds = useInteraction((s) => s.setSelectedTableIds);
  const clearCanvasSelection = useInteraction((s) => s.clearCanvasSelection);

  if (!selectedTableIds.length) return null;

  const removeOne = (id: string) => {
    const next = selectedTableIds.filter((x) => x !== id);
    if (next.length) setSelectedTableIds(next);
    else clearCanvasSelection();
  };

  return (
    <div className="selection-bar">
      <span className="selection-bar__label">
        {selectedTableIds.length === 1
          ? '1 tabela selecionada'
          : `${selectedTableIds.length} tabelas selecionadas`}
      </span>
      <div className="selection-bar__chips">
        {selectedTableIds.map((id) => (
          <span key={id} className="selection-bar__chip" title={id}>
            <span className="selection-bar__chip-name">{shortName(id)}</span>
            <button
              type="button"
              className="selection-bar__chip-remove"
              aria-label={`Remover ${id} da seleção`}
              onClick={() => removeOne(id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {selectedTableIds.length > 1 && (
        <button type="button" className="selection-bar__clear" onClick={clearCanvasSelection}>
          Limpar
        </button>
      )}
    </div>
  );
}
