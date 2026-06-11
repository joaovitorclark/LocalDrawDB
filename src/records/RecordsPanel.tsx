import { useMemo, useState } from 'react';
import type { ParsedRecords } from '../dsl/records';
import { getColumnSettings, setColumnSetting, setTableOrRecordsNote } from '../dsl/edit';
import { useInteraction } from '../store/interaction';
import type { TableView } from '../dsl/parse';

type Props = {
  records: ParsedRecords[];
  tables: TableView[];
  dbml: string;
  onApply: (next: string) => void;
};

function NoteField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="records-note-field">
      <span className="records-note-field__label">{label}</span>
      <textarea
        className="records-note-field__input"
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function RecordsPanel({ records, tables, dbml, onApply }: Props) {
  const [open, setOpen] = useState(true);
  const selectedTable = useInteraction((s) => s.selectedTable);
  const selectedColumn = useInteraction((s) => s.selectedColumn);
  const selectedGroup = useInteraction((s) => s.selectedGroup);

  const effectiveTableId = selectedColumn?.table ?? selectedTable;

  const filtered = useMemo(() => {
    if (selectedGroup) {
      const groupTables = tables.filter((t) => t.group === selectedGroup);
      const ids = new Set(groupTables.map((t) => t.id));
      const names = new Set(groupTables.map((t) => t.name));
      return records.filter((r) => ids.has(r.table) || names.has(r.table));
    }
    if (effectiveTableId) {
      const table = tables.find((t) => t.id === effectiveTableId);
      return records.filter((r) => r.table === effectiveTableId || r.table === table?.name);
    }
    return [];
  }, [records, effectiveTableId, selectedGroup, tables]);

  const activeTable = useMemo(
    () => (effectiveTableId ? tables.find((t) => t.id === effectiveTableId) : undefined),
    [effectiveTableId, tables],
  );

  const activeRecord = useMemo(() => {
    if (!effectiveTableId) return undefined;
    return records.find((r) => r.table === effectiveTableId || r.table === activeTable?.name);
  }, [records, effectiveTableId, activeTable?.name]);

  const tableNote = activeRecord?.note ?? activeTable?.note ?? '';

  const columnSettings = useMemo(
    () =>
      selectedColumn
        ? getColumnSettings(dbml, selectedColumn.table, selectedColumn.column)
        : null,
    [dbml, selectedColumn],
  );

  const noteOnlyEntries = useMemo(() => {
    if (selectedGroup) {
      return tables
        .filter((t) => t.group === selectedGroup && t.note)
        .filter((t) => !filtered.some((r) => r.table === t.id || r.table === t.name))
        .map((t) => ({ table: t.id, note: t.note! }));
    }
    return [];
  }, [selectedGroup, tables, filtered]);

  const panelCount = filtered.length + noteOnlyEntries.length + (effectiveTableId ? 1 : 0);

  if (!effectiveTableId && !selectedGroup) return null;
  if (!panelCount && !effectiveTableId) return null;

  const applyTableNote = (note: string) => {
    if (!effectiveTableId) return;
    onApply(setTableOrRecordsNote(dbml, effectiveTableId, note));
  };

  const applyColumnNote = (note: string) => {
    if (!selectedColumn || !columnSettings) return;
    onApply(
      setColumnSetting(dbml, selectedColumn.table, selectedColumn.column, {
        ...columnSettings,
        note,
      }),
    );
  };

  return (
    <div className={`records-panel ${open ? 'is-open' : ''}`}>
      <button className="records-panel__toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Dados (amostra) · {Math.max(panelCount, 1)} tabela(s)
      </button>
      {open && (
        <div className="records-panel__body">
          {effectiveTableId && (
            <div className="records-table records-table--notes">
              <div className="records-table__title">{effectiveTableId}</div>
              <NoteField
                label="Nota da tabela"
                value={tableNote}
                placeholder="Descrição ou contexto da tabela…"
                onChange={applyTableNote}
              />
              {selectedColumn && (
                <NoteField
                  label={`Nota · ${selectedColumn.column}`}
                  value={columnSettings?.note ?? ''}
                  placeholder="Descrição da coluna…"
                  onChange={applyColumnNote}
                />
              )}
            </div>
          )}
          {noteOnlyEntries.map((e) => (
            <div key={`note:${e.table}`} className="records-table">
              <div className="records-table__title">{e.table}</div>
              <p className="records-table__note">{e.note}</p>
            </div>
          ))}
          {filtered.map((r) => {
            const tbl = tables.find((t) => t.id === r.table || t.name === r.table);
            const displayNote = r.note ?? tbl?.note;
            return (
              <div key={r.table} className="records-table">
                <div className="records-table__title">
                  {r.table} <span className="records-table__count">{r.rows.length} linhas</span>
                </div>
                {displayNote && effectiveTableId !== r.table && effectiveTableId !== tbl?.id && (
                  <p className="records-table__note">{displayNote}</p>
                )}
                <div className="records-table__scroll">
                  <table>
                    {r.columns.length > 0 && (
                      <thead>
                        <tr>
                          {r.columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {r.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
