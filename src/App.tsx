import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from './editor/Editor';
import { Canvas } from './canvas/Canvas';
import { METADATA_SNIPPET, newTableTemplate, parseDbml, type ParseResult } from './dsl/parse';
import { validateModel } from './dsl/validateModel';
import { organize } from './dsl/organize';
import { autolayoutPositions } from './canvas/autolayout';
import { ProblemsPanel } from './canvas/ProblemsPanel';
import { appendRef, removeRef, renameColumn, renameTable, addColumn, setTableLayer, addLayerGroup, addLineageEntry, removeLineageEntry } from './dsl/edit';
import { RecordsPanel } from './records/RecordsPanel';
import { ColumnPanel } from './canvas/ColumnPanel';
import { CanvasActionsCtx, type CanvasActions } from './canvas/actions';
import { LayersPanel } from './canvas/LayersPanel';
import { layersFromGroups, tableLayerMap, layerColorOf } from './layers';
import { useInteraction } from './store/interaction';
import { captureDiagramPng, downloadDataUrl } from './exportPng';
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
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const loadedRef = useRef(false);
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
    baselineRef.current = s;
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
  const [canvasModel, setCanvasModel] = useState<ParseResult>({ tables: [], refs: [], records: [], layerGroups: [], lineage: [] });
  useEffect(() => {
    if (!parsed.error) setCanvasModel(parsed);
  }, [parsed]);

  const modelIssues = useMemo(() => validateModel(canvasModel), [canvasModel]);

  const focusTable = useCallback((tableId: string) => {
    setFocusTableId(tableId);
    useInteraction.getState().selectTable(tableId);
  }, []);

  const handleAutolayout = useCallback(() => {
    const lineageMode = useInteraction.getState().lineageMode;
    setPositions(autolayoutPositions(canvasModel, lineageMode));
    setStatus('Canvas reorganizado');
    setSaveState('dirty');
  }, [canvasModel]);

  // Lineage derivado do DBML (ParsedLineage[] → LineageLink[]).
  const lineage = useMemo<LineageLink[]>(() => {
    const out: LineageLink[] = [];
    for (const entry of canvasModel.lineage) {
      for (const s of entry.sources) out.push({ source: s, target: entry.target });
    }
    return out;
  }, [canvasModel.lineage]);

  // Camadas vêm do DBML (LayerGroup) — fonte de verdade exportável.
  const layersArr = useMemo(() => layersFromGroups(canvasModel.layerGroups), [canvasModel.layerGroups]);
  const layerMembership = useMemo(() => tableLayerMap(canvasModel.layerGroups), [canvasModel.layerGroups]);
  const layerOf = useCallback(
    (id: string) => {
      if (layerMembership[id]) return layerMembership[id];
      const schema = id.includes('.') ? id.split('.')[0] : undefined; // auto-match por schema
      return schema && layersArr.some((l) => l.id === schema) ? schema : undefined;
    },
    [layerMembership, layersArr],
  );

  // Ações do canvas (mutações de documento e cores) expostas via contexto.
  const actions = useMemo<CanvasActions>(
    () => ({
      onSelectColumn: (table, column) => selectColumn({ table, column }),
      onRenameColumn: (table, oldName, newName) =>
        setDbml((d) => renameColumn(d, table, oldName, newName)),
      onRenameTable: (tableId, newName) => setDbml((d) => renameTable(d, tableId, newName)),
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
        const t = canvasModel.tables.find((x) => x.id === id);
        const sources = lineage.filter((l) => l.target === id).map((l) => l.source);
        const rec = canvasModel.records.find((r) => r.table === id || r.table === t?.name);
        const sample = rec ? { columns: rec.columns, rows: rec.rows } : null;
        const pks = t ? t.columns.filter((c) => c.pk).map((c) => c.name) : [];
        const fks = canvasModel.refs
          .filter((r) => r.source === id)
          .map((r) => ({ column: r.fromCol, ref: `${r.target}.${r.toCol}` }));
        const refsIn = [...new Set(canvasModel.refs.filter((r) => r.target === id).map((r) => r.source))];
        const columnNotes = t
          ? t.columns.filter((c) => c.note).map((c) => ({ column: c.name, note: c.note as string }))
          : [];
        const has = !!(sources.length || sample || pks.length || fks.length || refsIn.length || t?.note || columnNotes.length);
        return { sources, sample, pks, fks, refsIn, note: t?.note, columnNotes, has };
      },
    }),
    [colors, selectColumn, layerOf, layersArr, canvasModel, lineage],
  );

  const handleCreateLineage = (source: string, target: string) => {
    if (!source || !target || source === target) return;
    setDbml((d) => addLineageEntry(d, source, target));
  };
  const handleRemoveLineage = (source: string, target: string) => {
    setDbml((d) => removeLineageEntry(d, source, target));
  };
  const handleToggleGroup = (name: string) =>
    setCollapsedGroups((prev) => (prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]));

  const handleCreateRef = (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => {
    if (!fromCol || !toCol) return;
    const fromTable = canvasModel.tables.find((t) => t.id === fromTbl);
    const toTable = canvasModel.tables.find((t) => t.id === toTbl);
    const fromIsPk = !!fromTable?.columns.find((c) => c.name === fromCol)?.pk;
    const toIsPk = !!toTable?.columns.find((c) => c.name === toCol)?.pk;
    if (fromIsPk && !toIsPk) {
      setDbml((d) => appendRef(d, toTbl, toCol, fromTbl, fromCol));
      setStatus(`Relação criada: ${toTbl}.${toCol} → ${fromTbl}.${fromCol}`);
    } else {
      setDbml((d) => appendRef(d, fromTbl, fromCol, toTbl, toCol));
      setStatus(`Relação criada: ${fromTbl}.${fromCol} → ${toTbl}.${toCol}`);
    }
  };

  const handleRemoveRef = (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => {
    setDbml((d) => removeRef(d, fromTbl, fromCol, toTbl, toCol));
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
      const { dbml: merged, imported } = await api.importFromInput(dbml);
      setDbml(merged);
      return imported.length ? `Importado: ${imported.join(', ')}` : 'Nenhum .sql em data/input/';
    });

  const handleExport = (
    kind: 'ddl' | 'dbt' | 'erwin' | 'mermaid',
    fn: (d: string) => Promise<{ files: string[] }>,
  ) => run(`Exportando ${kind}`, async () => `Gerado: ${(await fn(dbml)).files.join(', ')}`);

  const handlePng = () =>
    run('Exportando PNG', async () => {
      const dataUrl = await captureDiagramPng();
      downloadDataUrl(dataUrl, 'diagram.png');
      await api.exportPng(dataUrl).catch(() => {});
      return 'PNG gerado (download + data/output/diagram.png)';
    });

  const addTable = () => {
    const name = prompt('Nome da nova tabela (schema.tabela):', 'novo_schema.nova_tabela');
    if (name) setDbml((d) => d + newTableTemplate(name.trim()));
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
        <button onClick={() => handleExport('ddl', api.exportDdl)}>Export DDL</button>
        <button onClick={() => handleExport('dbt', api.exportDbt)}>Export dbt</button>
        <button onClick={() => handleExport('erwin', api.exportErwin)}>Export erwin</button>
        <button onClick={() => handleExport('mermaid', api.exportMermaid)}>Export Mermaid</button>
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
          <Editor value={dbml} onChange={setDbml} error={parsed.error} onFocusTable={focusTable} />
        </section>
        <section className="pane pane--canvas">
          <CanvasActionsCtx.Provider value={actions}>
            <Canvas
              parsed={canvasModel}
              positions={positions}
              onPositionsChange={setPositions}
              onCreateRef={handleCreateRef}
              onRemoveRef={handleRemoveRef}
              lineage={lineage}
              onCreateLineage={handleCreateLineage}
              onRemoveLineage={handleRemoveLineage}
              layerOf={layerOf}
              collapsedGroups={collapsedGroups}
              onToggleGroup={handleToggleGroup}
              focusTableId={focusTableId}
              onFocusTableDone={() => setFocusTableId(null)}
            />
            <LayersPanel
              layers={layersArr}
              tables={canvasModel.tables.map((t) => ({ id: t.id }))}
              onAddLayer={actions.onAddLayer}
              onFocusTable={focusTable}
              onAutolayout={handleAutolayout}
            />
            <ProblemsPanel issues={modelIssues} onFocusTable={focusTable} />
            <ColumnPanel dbml={dbml} tables={canvasModel.tables} onApply={setDbml} />
          </CanvasActionsCtx.Provider>
          <RecordsPanel records={canvasModel.records} tables={canvasModel.tables} />
        </section>
      </main>
    </div>
  );
}
