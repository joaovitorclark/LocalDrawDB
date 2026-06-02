import type { TableMeta } from './actions';

// Popover de metadados: sources, exemplo de dados, PKs/FKs e comentários.
export function TableInfoPopover({ meta }: { meta: TableMeta }) {
  return (
    <div className="info-popover" onClick={(e) => e.stopPropagation()}>
      {meta.sources.length > 0 && (
        <section>
          <h5>Sources (linhagem)</h5>
          <div>derivado de: {meta.sources.join(', ')}</div>
        </section>
      )}
      {meta.sample && (
        <section>
          <h5>Exemplo de dados</h5>
          <table className="info-sample">
            {meta.sample.columns.length > 0 && (
              <thead>
                <tr>{meta.sample.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {meta.sample.rows.slice(0, 5).map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {(meta.pks.length > 0 || meta.fks.length > 0 || meta.refsIn.length > 0) && (
        <section>
          <h5>PKs / FKs</h5>
          {meta.pks.length > 0 && <div>PK: {meta.pks.join(', ')}</div>}
          {meta.fks.map((f) => (
            <div key={f.column}>FK: {f.column} → {f.ref}</div>
          ))}
          {meta.refsIn.length > 0 && <div>referenciada por: {meta.refsIn.join(', ')}</div>}
        </section>
      )}
      {(meta.note || meta.columnNotes.length > 0) && (
        <section>
          <h5>Comentários</h5>
          {meta.note && <div>{meta.note}</div>}
          {meta.columnNotes.map((c) => (
            <div key={c.column}>
              <b>{c.column}:</b> {c.note}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
