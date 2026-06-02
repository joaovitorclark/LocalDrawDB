// Contexto com as ações que mutam o documento/cores/layers, consumidas por nós
// profundos (TableNode/GroupNode) sem prop-drilling pelo React Flow.
import { createContext, useContext } from 'react';
import type { Layer } from '../api';

export type TableMeta = {
  sources: string[]; // linhagem: tabelas de origem
  sample: { columns: string[]; rows: string[][] } | null;
  pks: string[];
  fks: { column: string; ref: string }[];
  refsIn: string[]; // referenciada por
  note?: string;
  columnNotes: { column: string; note: string }[];
  has: boolean; // tem algum metadado?
};

export type CanvasActions = {
  onSelectColumn: (table: string, column: string) => void;
  onRenameColumn: (table: string, oldName: string, newName: string) => void;
  onRenameTable: (tableId: string, newName: string) => void;
  onAddColumn: (table: string) => void;
  colorOf: (tableId: string) => string | undefined;
  onSetColor: (tableId: string, color: string | null) => void;
  // layers
  layerOf: (tableId: string) => string | undefined;
  layerColorOf: (layerId?: string) => string | undefined;
  onSetLayer: (tableId: string, layerId: string | null) => void;
  layers: Layer[];
  onAddLayer: (name: string, color: string) => void;
  // grupos
  onToggleGroup: (name: string) => void;
  // metadados
  tableMeta: (tableId: string) => TableMeta;
};

export const CanvasActionsCtx = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions {
  const ctx = useContext(CanvasActionsCtx);
  if (!ctx) throw new Error('CanvasActionsCtx ausente');
  return ctx;
}

/** Paleta de cores para o cabeçalho das tabelas (Unimed + neutros). */
export const TABLE_COLORS = ['#13284b', '#00995d', '#1c3a6b', '#b5651d', '#6b21a8', '#475569'];
