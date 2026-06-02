import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from './editor/Editor';
import { Canvas } from './canvas/Canvas';
import { METADATA_SNIPPET, newTableTemplate, parseDbml, type ParseResult } from './dsl/parse';
import { organize } from './dsl/organize';
import { appendRef, removeRef, renameColumn, renameTable, addColumn } from './dsl/edit';
import { RecordsPanel } from './records/RecordsPanel';
import { ColumnPanel } from './canvas/ColumnPanel';
import { CanvasActionsCtx, type CanvasActions } from './canvas/actions';
import { useInteraction } from './store/interaction';
import { captureDiagramPng, downloadDataUrl } from './exportPng';
import * as api from './api';

type Positions = Record<string, { x: number; y: number }>;
type Colors = Record<string, string>;
type Snapshot = { dbml: string; positions: Positions; colors: Colors };

const SAMPLE = `Table loja.cliente {
  id bigint [pk]
  nome string
  email string
}

Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
  total decimal(18,2)
  criado_em timestamp
}

Ref: loja.pedido.cliente_id > loja.cliente.id
`;

export default function App() {
  const [dbml, setDbml] = useState('');
  const [positions, setPositions] = useState<Positions>({});
  const [colors, setColors] = useState<Colors>({});
  const [status, setStatus] = useState('Carregando…');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
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
        baselineRef.current = { dbml: dbml0, positions: pos0, colors: col0 };
        setStatus('Pronto');
      })
      .catch(() => {
        setDbml(SAMPLE);
        baselineRef.current = { dbml: SAMPLE, positions: {}, colors: {} };
        setStatus('Backend offline — editando localmente');
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
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, redo]);

  // Parse (driva o canvas). Recalcula a cada mudança de DBML.
  const parsed = useMemo(() => parseDbml(dbml), [dbml]);

  // Mantém o último modelo válido no canvas mesmo com erro de digitação no editor.
  const [canvasModel, setCanvasModel] = useState<ParseResult>({ tables: [], refs: [], records: [] });
  useEffect(() => {
    if (!parsed.error) setCanvasModel(parsed);
  }, [parsed]);

  // Autosave debounced (DBML + posições + cores) com estado visível.
  useEffect(() => {
    if (!loadedRef.current) return;
    setSaveState('saving');
    const id = setTimeout(() => {
      api
        .saveProject(dbml, { positions, colors })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 800);
    return () => clearTimeout(id);
  }, [dbml, positions, colors]);

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
    }),
    [colors, selectColumn],
  );

  const handleCreateRef = (fromTbl: string, fromCol: string, toTbl: string, toCol: string) => {
    if (!fromCol || !toCol) return;
    setDbml((d) => appendRef(d, fromTbl, fromCol, toTbl, toCol));
    setStatus(`Relação criada: ${fromTbl}.${fromCol} → ${toTbl}.${toCol}`);
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
        <span className="status">{status}</span>
        <span className={`savestate savestate--${saveState}`}>
          {saveState === 'saving'
            ? 'Salvando…'
            : saveState === 'error'
              ? '⚠ Falha ao salvar'
              : 'Salvo ✓'}
        </span>
      </header>

      <main className="panes">
        <section className="pane pane--editor">
          <Editor value={dbml} onChange={setDbml} error={parsed.error} />
        </section>
        <section className="pane pane--canvas">
          <CanvasActionsCtx.Provider value={actions}>
            <Canvas
              parsed={canvasModel}
              positions={positions}
              onPositionsChange={setPositions}
              onCreateRef={handleCreateRef}
              onRemoveRef={handleRemoveRef}
            />
            <ColumnPanel dbml={dbml} onApply={setDbml} />
          </CanvasActionsCtx.Provider>
          <RecordsPanel records={parsed.records} />
        </section>
      </main>
    </div>
  );
}
