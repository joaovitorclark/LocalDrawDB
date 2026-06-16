import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ParsedFieldLineage, TableView } from '../dsl/parse';
import { useInteraction } from '../store/interaction';

type MappingKey = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
};

type Props = {
  tables: TableView[];
  mappings: ParsedFieldLineage[];
  onAdd: (sourceTable: string, sourceColumn: string, targetColumn: string, note?: string, ref?: string) => void;
  onUpdate: (
    prev: MappingKey,
    next: { sourceTable: string; sourceColumn: string; targetColumn: string; note?: string; ref?: string },
  ) => void;
  onRemove: (sourceTable: string, sourceColumn: string, targetColumn: string) => void;
};

function mappingKey(m: MappingKey) {
  return `${m.sourceTable}.${m.sourceColumn}->${m.targetTable}.${m.targetColumn}`;
}

function keysMatch(a: MappingKey | null, b: MappingKey) {
  return (
    !!a &&
    a.sourceTable === b.sourceTable &&
    a.sourceColumn === b.sourceColumn &&
    a.targetTable === b.targetTable &&
    a.targetColumn === b.targetColumn
  );
}

export function FieldLineagePanel({ tables, mappings, onAdd, onUpdate, onRemove }: Props) {
  const selectedTable = useInteraction((s) => s.selectedTable);
  const focused = useInteraction((s) => s.focusedFieldMapping);
  const focusFieldMapping = useInteraction((s) => s.focusFieldMapping);
  const setFocusedFieldMapping = useInteraction((s) => s.setFocusedFieldMapping);
  const mappingPanelOpen = useInteraction((s) => s.mappingPanelOpen);
  const toggleMappingPanel = useInteraction((s) => s.toggleMappingPanel);
  const lineageMode = useInteraction((s) => s.lineageMode);
  const fieldMappingFocusNonce = useInteraction((s) => s.fieldMappingFocusNonce);
  const [editing, setEditing] = useState<MappingKey | null>(null);
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

  const loadMapping = useCallback((m: ParsedFieldLineage) => {
    setEditing({
      sourceTable: m.sourceTable,
      sourceColumn: m.sourceColumn,
      targetTable: m.targetTable,
      targetColumn: m.targetColumn,
    });
    setSrcTable(m.sourceTable);
    setSrcCol(m.sourceColumn);
    setTgtCol(m.targetColumn);
    setNote(m.note ?? '');
    setRefPath(m.ref ?? '');
  }, []);

  const resetForm = useCallback(() => {
    setEditing(null);
    setSrcTable('');
    setSrcCol('');
    setTgtCol('');
    setNote('');
    setRefPath('');
  }, []);

  const startNew = useCallback(() => {
    resetForm();
    setFocusedFieldMapping(null);
  }, [resetForm, setFocusedFieldMapping]);

  useEffect(() => {
    if (!selectedTable) return;
    if (focused?.targetTable === selectedTable) return;
    resetForm();
    setFocusedFieldMapping(null);
  }, [selectedTable, focused?.targetTable, resetForm, setFocusedFieldMapping]);

  useEffect(() => {
    if (!lineageMode || !focused || focused.targetTable !== selectedTable) return;
    const match = mappings.find((m) => keysMatch(focused, m));
    if (match) loadMapping(match);
  }, [lineageMode, focused, fieldMappingFocusNonce, mappings, selectedTable, loadMapping]);

  if (!selectedTable || !target) return null;

  const sourceTables = tables.filter((t) => t.id !== selectedTable);

  const handleAdd = () => {
    if (!srcTable || !srcCol.trim() || !tgtCol.trim()) return;
    onAdd(srcTable, srcCol.trim(), tgtCol.trim(), note.trim() || undefined, refPath.trim() || undefined);
    startNew();
  };

  const handleSave = () => {
    if (!editing || !srcTable || !srcCol.trim() || !tgtCol.trim()) return;
    onUpdate(editing, {
      sourceTable: srcTable,
      sourceColumn: srcCol.trim(),
      targetColumn: tgtCol.trim(),
      note: note.trim() || undefined,
      ref: refPath.trim() || undefined,
    });
    focusFieldMapping({
      sourceTable: srcTable,
      sourceColumn: srcCol.trim(),
      targetTable: selectedTable,
      targetColumn: tgtCol.trim(),
    });
    setEditing({
      sourceTable: srcTable,
      sourceColumn: srcCol.trim(),
      targetTable: selectedTable,
      targetColumn: tgtCol.trim(),
    });
  };

  const isFocused = (m: ParsedFieldLineage) => keysMatch(focused, m);
  const isEditing = (m: ParsedFieldLineage) => keysMatch(editing, m);

  return (
    <div className="field-lineage-panel-wrap">
      {mappingPanelOpen && (
        <div className="field-lineage-panel">
          <div className="field-lineage-panel__head">
            <strong>Mapeamentos</strong>
            <span className="field-lineage-panel__tbl">{selectedTable}</span>
          </div>
          <p className="field-lineage-panel__hint">
            Clique num item para editar. Export: DBML <code>LineageFields</code>, SQL <code>@lineage</code>.
          </p>

          <ul className="field-lineage-panel__list">
            {forTarget.map((m) => (
              <li key={mappingKey(m)}>
                <button
                  type="button"
                  className={`field-lineage-panel__row-btn${isFocused(m) || isEditing(m) ? ' is-active' : ''}`}
                  onClick={() => {
                    loadMapping(m);
                    focusFieldMapping({
                      sourceTable: m.sourceTable,
                      sourceColumn: m.sourceColumn,
                      targetTable: m.targetTable,
                      targetColumn: m.targetColumn,
                    });
                  }}
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
                  onClick={() => {
                    onRemove(m.sourceTable, m.sourceColumn, m.targetColumn);
                    if (isEditing(m)) startNew();
                  }}
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
            <div className="field-lineage-panel__form-head">
              <span>{editing ? 'Editar mapeamento' : 'Novo mapeamento'}</span>
              <button type="button" className="field-lineage-panel__new-btn" onClick={startNew} title="Novo mapeamento">
                +
              </button>
            </div>
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
            <div className="field-lineage-panel__actions">
              {editing ? (
                <button type="button" className="field-lineage-panel__add-btn" onClick={handleSave}>
                  Salvar
                </button>
              ) : (
                <button type="button" className="field-lineage-panel__add-btn" onClick={handleAdd}>
                  + mapeamento
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={`field-lineage-panel__toggle${mappingPanelOpen ? ' is-open' : ''}`}
        onClick={toggleMappingPanel}
        aria-expanded={mappingPanelOpen}
      >
        Mapeamento
      </button>
    </div>
  );
}
