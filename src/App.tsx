import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Editor, type EditorHandle } from './editor/Editor';
import { Canvas } from './canvas/Canvas';
import { METADATA_SNIPPET, newTableTemplate, parseDbml, type ParseResult } from './dsl/parse';
import { validateModel } from './dsl/validateModel';
import { organize } from './dsl/organize';
import { autolayoutLineagePositions, autolayoutPositions } from './canvas/autolayout';
import { defaultTablePosition } from './canvas/defaultTablePosition';
import { ProblemsPanel } from './canvas/ProblemsPanel';
import {
  appendRef, removeRef, removeTable, renameColumnAllRefs, renameTable, addColumn, setTableLayer, addLayerGroup,
  addLineageEntry, removeLineageEntry, addFieldLineageEntry, removeFieldLineageEntry, updateFieldLineageEntry,
} from './dsl/edit';
import { RecordsPanel } from './records/RecordsPanel';
import { ColumnPanel } from './canvas/ColumnPanel';
import { FieldLineagePanel } from './canvas/FieldLineagePanel';
import { CanvasActionsCtx, type CanvasActions } from './canvas/actions';
import { LayersPanel } from './canvas/LayersPanel';
import { layersFromGroups, tableLayerMap, layerColorOf } from './layers';
import { useInteraction } from './store/interaction';
import { detectRenames } from './dsl/renameDetect';
import { isCompleteTableId } from './dsl/edit';
import { resolveTableId, tableAtLine } from './dsl/lineLocate';
import { shouldPanToTable, shouldSyncEditorTable, type FocusTableOptions } from './editor/syncEditorCanvas';
import { captureDiagramPng, downloadDataUrl } from './exportPng';
import { ExportMenu } from './ExportMenu';
import { exportInputL2Warning } from './exportWarnings';
import * as api from './api';
import type { LineageLink } from './api';

type Positions = Record<string, { x: number; y: number }>;
type Colors = Record<string, string>;
type Snapshot = { dbml: string; positions: Positions; colors: Colors };

const SAMPLE = `TableGroup vendas {
  loja.cliente
  loja.pedido
}

LayerGroup bronze [color: #b08d57] {
  loja.cliente
}

Table loja.cliente {
  id bigint [pk]
  nome string
  email string
  Note: 'Dimensão de clientes'
}

Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
  total decimal(18,2)
  criado_em timestamp
}

Ref: loja.pedido.cliente_id > loja.cliente.id

Lineage {
  loja.pedido < loja.cliente
}
`;

export default function App() {
  const [dbml, setDbml] = useState('');
  const [positions, setPositions] = useState<Positions>({});
  const [colors, setColors] = useState<Colors>({});
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [status, setStatus] = useState('Carregando…');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSave, setAutoSave] = useState(false);
  const [focusTableId, setFocusTableId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [fitViewTrigger, setFitViewTrigger] = useState(0);
  const loadedRef = useRef(false);
  const prevDbmlRef = useRef('');
  const editorRef = useRef<EditorHandle>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout>>();
  const selectColumn = useInteraction((s) => s.selectColumn);

  // Histórico global (undo/redo) de snapshots {dbml, positions, colors}.
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const baselineRef = useRef<Snapshot | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();

  // Carrega o projeto persistido (ou exemplo se vazio).
  useEffect(() => {
    api
      .loadProject()
      .then((p) => {
        const dbml0 = p.dbml || SAMPLE;
        const pos0 = p.canvas?.positions ?? {};
        const col0 = p.canvas?.colors ?? {};
        setDbml(dbml0);
        prevDbmlRef.current = dbml0;
        setPositions(pos0);
        setColors(col0);
        setCollapsedGroups(p.canvas?.collapsedGroups ?? []);
        baselineRef.current = { dbml: dbml0, positions: pos0, colors: col0 };
        setStatus('Pronto');
        setSaveState('saved');
      })
      .catch(() => {
        setDbml(SAMPLE);
        baselineRef.current = { dbml: SAMPLE, positions: {}, colors: {} };
        setStatus('Backend offline — editando localmente');
        setSaveState('saved');
      })
      .finally(() => {
        loadedRef.current = true;
      });
  }, []);

  // Commit debounced ao histórico: empurra o baseline anterior quando o estado muda.
  useEffect(() => {
    if (!loadedRef.current) return;
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const base = baselineRef.current;
      const cur: Snapshot = { dbml, positions, colors };
      if (
        base &&
        (base.dbml !== cur.dbml || base.positions !== cur.positions || base.colors !== cur.colors)
      ) {
        setPast((p) => [...p, base].slice(-100));
        setFuture([]);
        baselineRef.current = cur;
      }
    }, 400);
    return () => clearTimeout(commitTimer.current);
  }, [dbml, positions, colors]);

  const applySnapshot = useCallback((s: Snapshot) => {
    clearTimeout(commitTimer.current);
    clearTimeout(renameTimer.current);
    baselineRef.current = s;
    prevDbmlRef.current = s.dbml;
    setDbml(s.dbml);
    setPositions(s.positions);
    setColors(s.colors);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [{ dbml, positions, colors }, ...f]);
      applySnapshot(prev);
      return p.slice(0, -1);
    });
  }, [dbml, positions, colors, applySnapshot]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, { dbml, positions, colors }]);
      applySnapshot(next);
      return f.slice(1);
    });
  }, [dbml, positions, colors, applySnapshot]);

  // Marca dirty quando qualquer dado muda após o load.
  useEffect(() => {
    if (!loadedRef.current) return;
    setSaveState((s) => (s === 'idle' || s === 'saving' ? s : 'dirty'));
  }, [dbml, positions, colors, collapsedGroups]);

  const handleSave = useCallback(() => {
    setSaveState('saving');
    api
      .saveProject(dbml, { positions, colors, collapsedGroups })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
  }, [dbml, positions, colors, collapsedGroups]);

  // Auto-save: quando ativo, salva após 1.5s de dirty.
  useEffect(() => {
    if (!autoSave || saveState !== 'dirty') return;
    const id = setTimeout(handleSave, 1500);
    return () => clearTimeout(id);
  }, [autoSave, saveState, handleSave]);

  // Atalhos capturados ANTES do CodeMirror (cujo history nativo está desativado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        e.stopPropagation();
        redo();
      } else if (k === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, redo, handleSave]);

  // Parse (driva o canvas). Recalcula a cada mudança de DBML.
  const parsed = useMemo(() => parseDbml(dbml), [dbml]);

  // Mantém o último modelo válido no canvas mesmo com erro de digitação no editor.
  const [canvasModel, setCanvasModel] = useState<ParseResult>({
    tables: [], refs: [], records: [], layerGroups: [], lineage: [], lineageFields: [],
  });
  useEffect(() => {
    if (!parsed.error) setCanvasModel(parsed);
  }, [parsed]);

  /** Modelo ao vivo quando o parse é válido; evita canvas defasado após mutações (ex.: remover Ref). */
  const activeModel = useMemo(
    () => (parsed.error ? canvasModel : parsed),
    [parsed, canvasModel],
  );

  const editorCursorLineRef = useRef(0);
  const editingTableRef = useRef<string | null>(null);
  const lastPanTableRef = useRef<string | null>(null);

  const tableIdsKey = useMemo(
    () => activeModel.tables.map((t) => t.id).join('\0'),
    [activeModel.tables],
  );

  // Posições: remove órfãs e atribui posição default a tabelas novas (criadas no editor).
  useEffect(() => {
    const ids = new Set(activeModel.tables.map((t) => t.id));
    setPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      activeModel.tables.forEach((t, i) => {
        if (next[t.id]) return;
        next[t.id] = defaultTablePosition(next, i);
        changed = true;
      });
      return changed ? next : prev;
    });
    setColors((prev) => {
      const stale = Object.keys(prev).filter((id) => !ids.has(id));
      if (!stale.length) return prev;
      const next = { ...prev };
      for (const id of stale) delete next[id];
      return next;
    });
  }, [activeModel.tables]);

  const mutateDbml = useCallback((fn: (d: string) => string) => {
    setDbml((d) => {
      const next = fn(d);
      prevDbmlRef.current = next;
      return next;
    });
  }, []);

  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const modelIssues = useMemo(() => {
    const issues = validateModel(activeModel, dbml);
    const parseIssues = parsed.error
      ? [{ severity: 'error' as const, message: parsed.error, line: parsed.errorLine }]
      : [];
    const fromImport = importWarnings.map((message) => ({
      severity: 'error' as const,
      message,
    }));
    return [...parseIssues, ...fromImport, ...issues];
  }, [activeModel, dbml, parsed.error, parsed.errorLine, importWarnings]);

  const pruneCanvasState = useCallback((removedIds: string[]) => {
    const gone = new Set(removedIds);
    setPositions((prev) => {
      const next = { ...prev };
      for (const id of gone) delete next[id];
      return next;
    });
    setColors((prev) => {
      const next = { ...prev };
      for (const id of gone) delete next[id];
      return next;
    });
    const st = useInteraction.getState();
    if (st.selectedTable && gone.has(st.selectedTable)) st.selectTable(null);
    const nextIds = st.selectedTableIds.filter((id) => !gone.has(id));
    if (nextIds.length !== st.selectedTableIds.length) {
      if (nextIds.length) st.setSelectedTableIds(nextIds);
      else st.clearCanvasSelection();
    }
    if (
      st.focusedFieldMapping &&
      (gone.has(st.focusedFieldMapping.sourceTable) || gone.has(st.focusedFieldMapping.targetTable))
    ) {
      st.setFocusedFieldMapping(null);
    }
    if (focusTableId && gone.has(focusTableId)) setFocusTableId(null);
  }, [focusTableId]);

  const migrateTableId = useCallback((oldId: string, newId: string) => {
    setPositions((prev) => {
      if (!prev[oldId]) return prev;
      const next = { ...prev };
      next[newId] = prev[oldId];
      delete next[oldId];
      return next;
    });
    setColors((prev) => {
      if (!prev[oldId]) return prev;
      const next = { ...prev };
      next[newId] = prev[oldId];
      delete next[oldId];
      return next;
    });
    const st = useInteraction.getState();
    if (st.selectedTable === oldId) st.selectTable(newId);
    else if (st.selectedTableIds.includes(oldId)) {
      st.setSelectedTableIds(st.selectedTableIds.map((id) => (id === oldId ? newId : id)));
    }
    if (st.focusedFieldMapping?.sourceTable === oldId || st.focusedFieldMapping?.targetTable === oldId) {
      st.setFocusedFieldMapping(null);
    }
  }, []);

  const handleDbmlChange = useCallback(
    (next: string) => {
      setDbml(next);
      clearTimeout(renameTimer.current);
      renameTimer.current = setTimeout(() => {
        const prev = prevDbmlRef.current;
        const detected = detectRenames(prev, next);
        if (detected.length === 1) {
          const r = detected[0];
          if (r.kind === 'table' && r.oldId !== r.newId) {
            if (!isCompleteTableId(r.oldId) || !isCompleteTableId(r.newId)) {
              prevDbmlRef.current = next;
              return;
            }
            const propagated = renameTable(next, r.oldId, r.newId);
            prevDbmlRef.current = propagated;
            migrateTableId(r.oldId, r.newId);
            setDbml(propagated);
            setStatus(`Renomeado ${r.oldId} → ${r.newId} (refs atualizadas)`);
            return;
          }
          if (r.kind === 'column' && r.oldCol !== r.newCol) {
            const propagated = renameColumnAllRefs(next, r.table, r.oldCol, r.newCol);
            prevDbmlRef.current = propagated;
            setDbml(propagated);
            const sel = useInteraction.getState().selectedColumn;
            if (sel?.table === r.table && sel.column === r.oldCol) {
              selectColumn({ table: r.table, column: r.newCol });
            }
            setStatus(`Coluna ${r.oldCol} → ${r.newCol} (refs atualizadas)`);
            return;
          }
        }
        prevDbmlRef.current = next;
      }, 300);
    },
    [migrateTableId, selectColumn],
  );

  const goToLine = useCallback((line: number) => {
    setEditorCollapsed(false);
    requestAnimationFrame(() => editorRef.current?.goToLine(line));
  }, []);

  const goToColumn = useCallback((table: string, column: string) => {
    setEditorCollapsed(false);
    requestAnimationFrame(() => editorRef.current?.goToColumn(table, column));
  }, []);

  const clearFocusTable = useCallback(() => setFocusTableId(null), []);

  const focusTable = useCallback((tableId: string, options?: FocusTableOptions) => {
    setFocusTableId(tableId);
    useInteraction.getState().selectTable(tableId);
    if (shouldPanToTable(lastPanTableRef.current, tableId, options)) {
      lastPanTableRef.current = tableId;
      setFocusNonce((n) => n + 1);
    }
  }, []);

  const focusTableWithPan = useCallback(
    (tableId: string) => focusTable(tableId, { pan: true }),
    [focusTable],
  );

  const syncCanvasToEditorLine = useCallback(
    (line0: number) => {
      if (editorCollapsed) return;
      editorCursorLineRef.current = line0;
      const blockName = tableAtLine(dbml, line0);
      if (!blockName) return;
      const tableIds = activeModel.tables.map((t) => t.id);
      const tableId = resolveTableId(blockName, tableIds);
      if (!tableId || !shouldSyncEditorTable(editingTableRef.current, tableId)) return;
      editingTableRef.current = tableId;
      focusTable(tableId);
    },
    [dbml, activeModel.tables, editorCollapsed, focusTable],
  );

  const handleEditorCursorLine = useCallback(
    (line0: number) => syncCanvasToEditorLine(line0),
    [syncCanvasToEditorLine],
  );

  // Nova tabela no parse: foca se o cursor ainda está no bloco dela.
  useEffect(() => {
    syncCanvasToEditorLine(editorCursorLineRef.current);
  }, [tableIdsKey, syncCanvasToEditorLine]);

  const handleAutolayout = useCallback(() => {
    const lineageMode = useInteraction.getState().lineageMode;
    setPositions(
      lineageMode ? autolayoutLineagePositions(activeModel) : autolayoutPositions(activeModel, false),
    );
    setFitViewTrigger((n) => n + 1);
    setStatus(
      lineageMode
        ? `Canvas reorganizado para linhagem (${activeModel.tables.length} tabelas)`
        : `Canvas reorganizado (${activeModel.tables.length} tabelas)`,
    );
    setSaveState('dirty');
  }, [activeModel]);

  // Lineage derivado do DBML (ParsedLineage[] → LineageLink[]).
  const lineage = useMemo<LineageLink[]>(() => {
    const out: LineageLink[] = [];
    for (const entry of activeModel.lineage) {
      for (const s of entry.sources) out.push({ source: s, target: entry.target });
    }
    return out;
  }, [activeModel.lineage]);

  // Camadas vêm do DBML (LayerGroup) — fonte de verdade exportável.
  const layersArr = useMemo(() => layersFromGroups(activeModel.layerGroups), [activeModel.layerGroups]);
  const layerMembership = useMemo(() => tableLayerMap(activeModel.layerGroups), [activeModel.layerGroups]);
  const layerOf = useCallback(
    (id: string) => {
      if (layerMembership[id]) return layerMembership[id];
      const schema = id.includes('.') ? id.split('.')[0] : undefined; // auto-match por schema
      return schema && layersArr.some((l) => l.id === schema) ? schema : undefined;
    },
    [layerMembership, layersArr],
  );

  const handleRemoveTable = useCallback(
    (tableId: string) => {
      mutateDbml((d) => removeTable(d, tableId));
      pruneCanvasState([tableId]);
      setStatus(`Tabela removida: ${tableId}`);
      setSaveState('dirty');
    },
    [mutateDbml, pruneCanvasState],
  );

  const handleRemoveTables = useCallback(
    (tableIds: string[]) => {
      if (!tableIds.length) return;
      mutateDbml((d) => tableIds.reduce((acc, id) => removeTable(acc, id), d));
      pruneCanvasState(tableIds);
      setStatus(`${tableIds.length} tabela(s) removida(s)`);
      setSaveState('dirty');
    },
    [mutateDbml, pruneCanvasState],
  );

  // Ações do canvas (mutações de documento e cores) expostas via contexto.
  const actions = useMemo<CanvasActions>(
    () => ({
      onSelectColumn: (table, column) => selectColumn({ table, column }),
      onRenameColumn: (table, oldName, newName) => {
        setDbml((d) => {
          const next = renameColumnAllRefs(d, table, oldName, newName);
          prevDbmlRef.current = next;
          return next;
        });
      },
      onGoToColumn: goToColumn,
      onRenameTable: (tableId, newName) => {
        setDbml((d) => {
          const next = renameTable(d, tableId, newName);
          prevDbmlRef.current = next;
          return next;
        });
        migrateTableId(tableId, newName.trim());
      },
      onRemoveTable: handleRemoveTable,
      onAddColumn: (table) => setDbml((d) => addColumn(d, table, 'nova_coluna', 'string')),
      colorOf: (id) => colors[id],
      onSetColor: (id, color) =>
        setColors((prev) => {
          const next = { ...prev };
          if (color) next[id] = color;
          else delete next[id];
          return next;
        }),
      layerOf,
      layerColorOf: (layerId) => layerColorOf(layersArr, layerId),
      onSetLayer: (id, layerId) =>
        setDbml((d) => setTableLayer(d, id, layerId, layerColorOf(layersArr, layerId ?? undefined))),
      layers: layersArr,
      onAddLayer: (name, color) => setDbml((d) => addLayerGroup(d, name, color)),
      onToggleGroup: (name) =>
        setCollapsedGroups((prev) => (prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name])),
      tableMeta: (id) => {
        const t = activeModel.tables.find((x) => x.id === id);
        const sources = lineage.filter((l) => l.target === id).map((l) => l.source);
        const rec = activeModel.records.find((r) => r.table === id || r.table === t?.name);
        const sample = rec ? { columns: rec.columns, rows: rec.rows } : null;
        const pks = t ? t.columns.filter((c) => c.pk).map((c) => c.name) : [];
        const fks = activeModel.refs
          .filter((r) => r.source === id)
          .map((r) => ({ column: r.fromCol, ref: `${r.target}.${r.toCol}` }));
        const refsIn = [...new Set(activeModel.refs.filter((r) => r.target === id).map((r) => r.source))];
        const columnNotes = t
          ? t.columns.filter((c) => c.note).map((c) => ({ column: c.name, note: c.note as string }))
          : [];
        const has = !!(sources.length || sample || pks.length || fks.length || refsIn.length || t?.note || columnNotes.length);
        return { sources, sample, pks, fks, refsIn, note: t?.note, columnNotes, has };
      },
    }),
    [colors, selectColumn, layerOf, layersArr, activeModel, lineage, goToColumn, migrateTableId, handleRemoveTable],
  );

  const handleCreateLineage = (source: string, target: string) => {
    if (!source || !target || source === target) return;
    mutateDbml((d) => addLineageEntry(d, source, target));
  };
  const handleRemoveLineage = (source: string, target: string) => {
    mutateDbml((d) => removeLineageEntry(d, source, target));
  };
  const handleAddFieldLineage = (
    sourceTable: string, sourceColumn: string, targetColumn: string, note?: string, ref?: string,
  ) => {
    const targetTable = useInteraction.getState().selectedTable;
    if (!targetTable) return;
    mutateDbml((d) =>
      addFieldLineageEntry(d, sourceTable, sourceColumn, targetTable, targetColumn, { note, ref }),
    );
  };
  const handleRemoveFieldLineage = (
    sourceTable: string, sourceColumn: string, targetTable: string, targetColumn: string,
  ) => {
    mutateDbml((d) => removeFieldLineageEntry(d, sourceTable, sourceColumn, targetTable, targetColumn));
  };
  const handleUpdateFieldLineage = (
    prev: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string },
    next: { sourceTable: string; sourceColumn: string; targetColumn: string; note?: string; ref?: string },
  ) => {
    const targetTable = useInteraction.getState().selectedTable;
    if (!targetTable) return;
    mutateDbml((d) =>
      updateFieldLineageEntry(d, prev, {
        ...next,
        targetTable,
      }),
    );
  };
  const handleToggleGroup = (name: string) =>
    setCollapsedGroups((prev) => (prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]));

  const handleCreateRef = (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => {
    if (!fromCol || !toCol) return;
    const fromTable = activeModel.tables.find((t) => t.id === fromTbl);
    const toTable = activeModel.tables.find((t) => t.id === toTbl);
    const fromIsPk = !!fromTable?.columns.find((c) => c.name === fromCol)?.pk;
    const toIsPk = !!toTable?.columns.find((c) => c.name === toCol)?.pk;
    if (fromIsPk && !toIsPk) {
      mutateDbml((d) => appendRef(d, toTbl, toCol, fromTbl, fromCol));
      setStatus(`Relação criada: ${toTbl}.${toCol} → ${fromTbl}.${fromCol}`);
    } else {
      mutateDbml((d) => appendRef(d, fromTbl, fromCol, toTbl, toCol));
      setStatus(`Relação criada: ${fromTbl}.${fromCol} → ${toTbl}.${toCol}`);
    }
  };

  const handleRemoveRef = (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => {
    mutateDbml((d) => removeRef(d, fromTbl, fromCol, toTbl, toCol));
    setStatus(`Relação removida: ${fromTbl}.${fromCol} → ${toTbl}.${toCol}`);
  };

  const run = useCallback(async (label: string, fn: () => Promise<string>) => {
    setStatus(`${label}…`);
    try {
      setStatus(await fn());
    } catch (e: any) {
      setStatus(`Erro: ${e?.message ?? e}`);
    }
  }, []);

  const handleImport = () =>
    run('Importando', async () => {
      const { dbml: merged, imported, warnings, lineageFieldCount } = await api.importFromInput(dbml);
      setDbml(merged);
      setImportWarnings(warnings ?? []);
      const warnNote = warnings?.length ? ` — ${warnings.length} aviso(s) no painel Problemas` : '';
      const l2Note =
        lineageFieldCount != null && lineageFieldCount > 0
          ? ` — ${lineageFieldCount} mapeamento(s) L2`
          : '';
      return imported.length
        ? `Importado: ${imported.join(', ')}${l2Note}${warnNote}`
        : 'Nenhum .sql em data/input/';
    });

  const handleExportOption = (opt: api.ExportOption) => {
    run(`Exportando ${opt.label}`, async () => {
      const result = await api.exportFormat(dbml, opt.format, opt.dialect);
      const files = result.files.join(', ');
      if (opt.format === 'localdrawdb') {
        const l2Warn = exportInputL2Warning(activeModel.tables, activeModel.lineageFields ?? []);
        return l2Warn ? `${l2Warn} — Gerado: ${files}` : `Gerado: ${files}`;
      }
      return `Gerado: ${files}`;
    });
  };

  const handlePng = () =>
    run('Exportando PNG', async () => {
      const dataUrl = await captureDiagramPng();
      downloadDataUrl(dataUrl, 'diagram.png');
      await api.exportPng(dataUrl).catch(() => {});
      return 'PNG gerado (download + data/output/diagram.png)';
    });

  const addTable = () => {
    const name = prompt('Nome da nova tabela (schema.tabela):', 'novo_schema.nova_tabela');
    if (!name?.trim()) return;
    const tableId = name.trim();
    mutateDbml((d) => d + newTableTemplate(tableId));
    setPositions((prev) => ({
      ...prev,
      [tableId]: defaultTablePosition(prev),
    }));
    focusTableWithPan(tableId);
    setStatus(`Tabela criada: ${tableId}`);
    setSaveState('dirty');
  };

  const addMetadata = () =>
    setDbml(
      (d) =>
        d +
        `\n// metadados padrão (cole dentro de uma Table):\n/*\n${METADATA_SNIPPET}\n*/\n`,
    );

  const handleOrganize = () => {
    setDbml((d) => organize(d));
    setStatus('Organizado: tabelas → refs → records');
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">LocalDrawDB</strong>
        <button onClick={undo} disabled={!past.length} title="Desfazer (Cmd/Ctrl+Z)">
          ↶
        </button>
        <button onClick={redo} disabled={!future.length} title="Refazer (Cmd/Ctrl+Shift+Z)">
          ↷
        </button>
        <button className="btn-primary" onClick={handleOrganize} title="Reordena: tabelas → refs → records">
          Organize
        </button>
        <button onClick={addTable}>+ Tabela</button>
        <button onClick={addMetadata} title="Insere o bloco de colunas de metadados padrão">
          + Metadados
        </button>
        <span className="sep" />
        <button onClick={handleImport}>Importar (input/)</button>
        <ExportMenu options={api.EXPORT_OPTIONS} onExport={handleExportOption} />
        <button onClick={handlePng}>Export PNG</button>
        <span className="sep" />
        <button
          className="btn-save"
          onClick={handleSave}
          disabled={saveState === 'saving' || saveState === 'saved' || saveState === 'idle'}
          title="Salvar (Cmd/Ctrl+S)"
        >
          Salvar
        </button>
        <span className="toolbar__autosave">
          <span className="toolbar__autosave-label">Auto-save</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoSave}
            className={`toggle-switch ${autoSave ? 'is-on' : ''}`}
            title={autoSave ? 'Auto-save ligado' : 'Auto-save desligado'}
            onClick={() => setAutoSave((a) => !a)}
          >
            <span className="toggle-switch__knob" />
          </button>
        </span>
        <span className="status">{status}</span>
        <span className={`savestate savestate--${saveState}`}>
          {saveState === 'saving'
            ? 'Salvando…'
            : saveState === 'error'
              ? '⚠ Falha ao salvar'
              : saveState === 'dirty'
                ? '● Não salvo'
                : 'Salvo ✓'}
        </span>
      </header>

      <main className={`panes ${editorCollapsed ? 'panes--editor-collapsed' : ''}`}>
        <section className="pane pane--editor">
          <button
            type="button"
            className="pane-collapse"
            onClick={() => setEditorCollapsed((c) => !c)}
            title={editorCollapsed ? 'Mostrar editor DBML' : 'Ocultar editor DBML'}
            aria-label={editorCollapsed ? 'Mostrar editor DBML' : 'Ocultar editor DBML'}
            aria-expanded={!editorCollapsed}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              {editorCollapsed ? (
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <Editor
            ref={editorRef}
            value={dbml}
            onChange={handleDbmlChange}
            error={parsed.error}
            errorLine={parsed.errorLine}
            onFocusTable={focusTableWithPan}
            onCursorLine={handleEditorCursorLine}
            onGoToError={() => setEditorCollapsed(false)}
          />
        </section>
        <section className="pane pane--canvas">
          <CanvasActionsCtx.Provider value={actions}>
            <Canvas
              parsed={activeModel}
              positions={positions}
              onPositionsChange={setPositions}
              onCreateRef={handleCreateRef}
              onRemoveRef={handleRemoveRef}
              onRemoveTable={handleRemoveTable}
              onRemoveTables={handleRemoveTables}
              staleWarning={!!parsed.error}
              lineage={lineage}
              lineageFields={activeModel.lineageFields ?? []}
              onCreateLineage={handleCreateLineage}
              onRemoveLineage={handleRemoveLineage}
              onRemoveFieldLineage={handleRemoveFieldLineage}
              layerOf={layerOf}
              collapsedGroups={collapsedGroups}
              onToggleGroup={handleToggleGroup}
              focusTableId={focusTableId}
              focusNonce={focusNonce}
              onFocusTableDone={clearFocusTable}
              fitViewTrigger={fitViewTrigger}
            />
            <LayersPanel
              layers={layersArr}
              tables={activeModel.tables.map((t) => ({ id: t.id }))}
              onAddLayer={actions.onAddLayer}
              onFocusTable={focusTableWithPan}
              onAutolayout={handleAutolayout}
            />
            <ProblemsPanel issues={modelIssues} onFocusTable={focusTableWithPan} onGoToLine={goToLine} />
            <ColumnPanel
              dbml={dbml}
              tables={activeModel.tables}
              onApply={(next) => {
                prevDbmlRef.current = next;
                setDbml(next);
              }}
              onRenameColumn={(table, oldName, newName) => {
                setDbml((d) => {
                  const next = renameColumnAllRefs(d, table, oldName, newName);
                  prevDbmlRef.current = next;
                  return next;
                });
                selectColumn({ table, column: newName });
              }}
              onGoToColumn={goToColumn}
            />
            <FieldLineagePanel
              tables={activeModel.tables}
              mappings={activeModel.lineageFields ?? []}
              onAdd={handleAddFieldLineage}
              onUpdate={handleUpdateFieldLineage}
              onRemove={(st, sc, tc) => {
                const tt = useInteraction.getState().selectedTable;
                if (tt) handleRemoveFieldLineage(st, sc, tt, tc);
              }}
            />
          </CanvasActionsCtx.Provider>
          <RecordsPanel
            records={activeModel.records}
            tables={activeModel.tables}
            dbml={dbml}
            onApply={(next) => {
              prevDbmlRef.current = next;
              setDbml(next);
              setSaveState('dirty');
            }}
          />
        </section>
      </main>
    </div>
  );
}
