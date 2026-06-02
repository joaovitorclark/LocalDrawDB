import { useInteraction } from '../store/interaction';
import { getColumnSettings, setColumnSetting, type ColSettings } from '../dsl/edit';

// Painel de propriedades da coluna selecionada. Edições reescrevem o DBML.
type Props = {
  dbml: string;
  onApply: (next: string) => void;
};

export function ColumnPanel({ dbml, onApply }: Props) {
  const sel = useInteraction((s) => s.selectedColumn);
  const selectColumn = useInteraction((s) => s.selectColumn);
  if (!sel) return null;

  const s = getColumnSettings(dbml, sel.table, sel.column);
  const apply = (patch: ColSettings) =>
    onApply(setColumnSetting(dbml, sel.table, sel.column, { ...s, ...patch }));

  return (
    <div className="column-panel">
      <div className="column-panel__head">
        <strong>{sel.column}</strong>
        <span className="column-panel__tbl">{sel.table}</span>
        <button className="column-panel__close" onClick={() => selectColumn(null)}>
          ✕
        </button>
      </div>
      <label className="column-panel__row">
        <input type="checkbox" checked={!!s.pk} onChange={(e) => apply({ pk: e.target.checked })} />
        Primary key
      </label>
      <label className="column-panel__row">
        <input
          type="checkbox"
          checked={!!s.notNull}
          onChange={(e) => apply({ notNull: e.target.checked })}
        />
        Not null
      </label>
      <label className="column-panel__field">
        Note
        <input
          type="text"
          value={s.note ?? ''}
          onChange={(e) => apply({ note: e.target.value })}
          placeholder="descrição"
        />
      </label>
      <label className="column-panel__field">
        Default
        <input
          type="text"
          value={s.default ?? ''}
          onChange={(e) => apply({ default: e.target.value })}
          placeholder="ex.: 0 ou 'x'"
        />
      </label>
    </div>
  );
}
