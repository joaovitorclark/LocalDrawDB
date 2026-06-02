import { useMemo, useState } from 'react';
import type { ParsedRecords } from '../dsl/records';
import { useInteraction } from '../store/interaction';
import type { TableView } from '../dsl/parse';

type Props = { records: ParsedRecords[]; tables: TableView[] };

export function RecordsPanel({ records, tables }: Props) {
  const [open, setOpen] = useState(true);
  const selectedTable = useInteraction((s) => s.selectedTable);
  const selectedGroup = useInteraction((s) => s.selectedGroup);

  const filtered = useMemo(() => {
    if (selectedGroup) {
      const groupTables = tables.filter((t) => t.group === selectedGroup);
      const ids = new Set(groupTables.map((t) => t.id));
      const names = new Set(groupTables.map((t) => t.name));
      return records.filter((r) => ids.has(r.table) || names.has(r.table));
    }
    if (selectedTable) {
      const table = tables.find((t) => t.id === selectedTable);
      return records.filter((r) => r.table === selectedTable || r.table === table?.name);
    }
    return [];
  }, [records, selectedTable, selectedGroup, tables]);

  const noteOnlyEntries = useMemo(() => {
    if (selectedGroup) {
      return tables
        .filter((t) => t.group === selectedGroup && t.note)
        .filter((t) => !filtered.some((r) => r.table === t.id || r.table === t.name))
        .map((t) => ({ table: t.id, note: t.note! }));
    }
    if (selectedTable) {
      const t = tables.find((x) => x.id === selectedTable);
      if (t?.note && !filtered.some((r) => r.table === t.id || r.table === t.name)) {
        return [{ table: t.id, note: t.note }];
      }
    }
    return [];
  }, [selectedGroup, selectedTable, tables, filtered]);

  if (!filtered.length && !noteOnlyEntries.length) return null;

  return (
    <div className={`records-panel ${open ? 'is-open' : ''}`}>
      <button className="records-panel__toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Dados (amostra) · {filtered.length + noteOnlyEntries.length} tabela(s)
      </button>
      {open && (
        <div className="records-panel__body">
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
              {displayNote && <p className="records-table__note">{displayNote}</p>}
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
