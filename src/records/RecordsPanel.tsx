import { useState } from 'react';
import type { ParsedRecords } from '../dsl/records';

// Drawer colapsável sob o canvas com a amostra de dados (blocos Records do DBML).
export function RecordsPanel({ records }: { records: ParsedRecords[] }) {
  const [open, setOpen] = useState(true);
  if (!records.length) return null;

  return (
    <div className={`records-panel ${open ? 'is-open' : ''}`}>
      <button className="records-panel__toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Dados (amostra) · {records.length} tabela(s)
      </button>
      {open && (
        <div className="records-panel__body">
          {records.map((r) => (
            <div key={r.table} className="records-table">
              <div className="records-table__title">
                {r.table} <span className="records-table__count">{r.rows.length} linhas</span>
              </div>
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
          ))}
        </div>
      )}
    </div>
  );
}
