import { useMemo, useState } from 'react';
import type { ParsedFieldLineage, TableView } from '../dsl/parse';
import { useInteraction } from '../store/interaction';

type Props = {
  tables: TableView[];
  mappings: ParsedFieldLineage[];
  onAdd: (sourceTable: string, sourceColumn: string, targetColumn: string, note?: string, ref?: string) => void;
  onRemove: (sourceTable: string, sourceColumn: string, targetColumn: string) => void;
  onUpdateMeta: (
    sourceTable: string,
    sourceColumn: string,
    targetColumn: string,
    note: string,
    ref: string,
  ) => void;
};

export function FieldLineagePanel({ tables, mappings, onAdd, onRemove, onUpdateMeta }: Props) {
  const selectedTable = useInteraction((s) => s.selectedTable);
  const setFocused = useInteraction((s) => s.setFocusedFieldMapping);
  const [srcTable, setSrcTable] = useState('');
  const [srcCol, setSrcCol] = useState('');
  const [tgtCol, setTgtCol] = useState('');
  const [note, setNote] = useState('');
  const [refPath, setRefPath] = useState('');

  const target = tables.find((t) => t.id === selectedTable);

  const forTarget = useMemo(
    () => (selectedTable ? mappings.filter((m) => m.targetTable === selectedTable) : []),
    [mappings, selectedTable],
  );

  if (!selectedTable || !target) return null;

  const sourceTables = tables.filter((t) => t.id !== selectedTable);

  const handleAdd = () => {
    if (!srcTable || !srcCol.trim() || !tgtCol.trim()) return;
    onAdd(srcTable, srcCol.trim(), tgtCol.trim(), note.trim() || undefined, refPath.trim() || undefined);
    setSrcCol('');
    setTgtCol('');
    setNote('');
    setRefPath('');
  };

  return (
    <div className="field-lineage-panel">
      <div className="field-lineage-panel__head">
        <strong>Mapeamentos</strong>
        <span className="field-lineage-panel__tbl">{selectedTable}</span>
      </div>
      <p className="field-lineage-panel__hint">
        Coluna de origem (bronze) → coluna destino nesta tabela.
      </p>

      <ul className="field-lineage-panel__list">
        {forTarget.map((m) => (
          <li key={`${m.sourceTable}.${m.sourceColumn}->${m.targetColumn}`}>
            <button
              type="button"
              className="field-lineage-panel__row-btn"
              onClick={() =>
                setFocused({
                  sourceTable: m.sourceTable,
                  sourceColumn: m.sourceColumn,
                  targetTable: m.targetTable,
                  targetColumn: m.targetColumn,
                })
              }
            >
              <span className="field-lineage-panel__src">
                {m.sourceTable}.{m.sourceColumn}
              </span>
              <span className="field-lineage-panel__arrow">→</span>
              <span className="field-lineage-panel__tgt">{m.targetColumn}</span>
            </button>
            {(m.note || m.ref) && (
              <div className="field-lineage-panel__meta">
                {m.note && <span title={m.note}>📝 {m.note}</span>}
                {m.ref && <span title={m.ref}>📄 {m.ref}</span>}
              </div>
            )}
            <button
              type="button"
              className="field-lineage-panel__del"
              title="Remover mapeamento"
              onClick={() => onRemove(m.sourceTable, m.sourceColumn, m.targetColumn)}
            >
              ✕
            </button>
          </li>
        ))}
        {forTarget.length === 0 && (
          <li className="field-lineage-panel__empty">Nenhum mapeamento para esta tabela</li>
        )}
      </ul>

      <div className="field-lineage-panel__add">
        <label className="field-lineage-panel__field">
          Tabela origem
          <select value={srcTable} onChange={(e) => setSrcTable(e.target.value)}>
            <option value="">— escolher —</option>
            {sourceTables.map((t) => (
              <option key={t.id} value={t.id}>{t.id}</option>
            ))}
          </select>
        </label>
        <label className="field-lineage-panel__field">
          Coluna origem
          <select value={srcCol} onChange={(e) => setSrcCol(e.target.value)} disabled={!srcTable}>
            <option value="">—</option>
            {(tables.find((t) => t.id === srcTable)?.columns ?? []).map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field-lineage-panel__field">
          Coluna destino
          <select value={tgtCol} onChange={(e) => setTgtCol(e.target.value)}>
            <option value="">—</option>
            {target.columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field-lineage-panel__field">
          Nota ETL
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="regra de negócio" />
        </label>
        <label className="field-lineage-panel__field">
          Ref (sql/py)
          <input type="text" value={refPath} onChange={(e) => setRefPath(e.target.value)} placeholder="jobs/transform.sql" />
        </label>
        <button type="button" className="field-lineage-panel__add-btn" onClick={handleAdd}>
          + mapeamento
        </button>
      </div>
    </div>
  );
}
