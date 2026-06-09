import { useMemo, useState } from 'react';
import { useInteraction } from '../store/interaction';
import { getColumnSettings, setColumnSetting, type ColSettings } from '../dsl/edit';
import type { TableView } from '../dsl/parse';

type Props = {
  dbml: string;
  tables: TableView[];
  onApply: (next: string) => void;
  onRenameColumn?: (table: string, oldName: string, newName: string) => void;
  onGoToColumn?: (table: string, column: string) => void;
};

export function ColumnPanel({ dbml, tables, onApply, onRenameColumn, onGoToColumn }: Props) {
  const sel = useInteraction((s) => s.selectedColumn);
  const selectColumn = useInteraction((s) => s.selectColumn);
  const [nameDraft, setNameDraft] = useState('');

  const table = useMemo(
    () => (sel ? tables.find((t) => t.id === sel.table) : undefined),
    [tables, sel],
  );

  const settings = useMemo(
    () => (sel ? getColumnSettings(dbml, sel.table, sel.column) : null),
    [dbml, sel],
  );

  const refOptions = useMemo(() => {
    if (!sel) return [];
    const out: { value: string; label: string }[] = [];
    for (const t of tables) {
      for (const c of t.columns) {
        if (t.id === sel.table && c.name === sel.column) continue;
        if (c.pk) out.push({ value: `${t.id}.${c.name}`, label: `${t.id}.${c.name} (PK)` });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [tables, sel]);

  const compositeHint = useMemo(() => {
    if (!sel || !table) return null;
    const groups = table.compositePks?.filter((g) => g.includes(sel.column) && g.length > 1);
    if (!groups?.length) return null;
    return groups.map((g) => `(${g.join(', ')})`).join(', ');
  }, [table, sel]);

  if (!sel || !settings) return null;

  const apply = (patch: ColSettings) =>
    onApply(setColumnSetting(dbml, sel.table, sel.column, { ...settings, ...patch }));

  const commitRename = () => {
    const v = nameDraft.trim();
    if (!v || v === sel.column || !onRenameColumn) return;
    onRenameColumn(sel.table, sel.column, v);
    selectColumn({ table: sel.table, column: v });
    setNameDraft(v);
  };

  const refValue = settings.refTarget ?? '';

  return (
    <div className="column-panel">
      <div className="column-panel__head">
        <strong>{sel.column}</strong>
        <span className="column-panel__tbl">{sel.table}</span>
        <button className="column-panel__close" onClick={() => selectColumn(null)}>
          ✕
        </button>
      </div>
      {compositeHint && (
        <p className="column-panel__hint">PK composta: {compositeHint}</p>
      )}
      <label className="column-panel__field">
        Nome
        <input
          type="text"
          value={nameDraft || sel.column}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
          }}
        />
      </label>
      {onGoToColumn && (
        <button
          type="button"
          className="column-panel__dbml-btn"
          onClick={() => onGoToColumn(sel.table, sel.column)}
        >
          Editar no DBML
        </button>
      )}
      <label className="column-panel__row">
        <input type="checkbox" checked={!!settings.pk} onChange={(e) => apply({ pk: e.target.checked })} />
        Primary key
      </label>
      <label className="column-panel__field">
        Referência (FK)
        <select
          value={refValue}
          onChange={(e) => apply({ refTarget: e.target.value || null })}
        >
          <option value="">— nenhuma —</option>
          {refOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="column-panel__row">
        <input
          type="checkbox"
          checked={!!settings.notNull}
          onChange={(e) => apply({ notNull: e.target.checked })}
        />
        Not null
      </label>
      <label className="column-panel__field">
        Note
        <input
          type="text"
          value={settings.note ?? ''}
          onChange={(e) => apply({ note: e.target.value })}
          placeholder="descrição"
        />
      </label>
      <label className="column-panel__field">
        Default
        <input
          type="text"
          value={settings.default ?? ''}
          onChange={(e) => apply({ default: e.target.value })}
          placeholder="ex.: 0 ou 'x'"
        />
      </label>
    </div>
  );
}
