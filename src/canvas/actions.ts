// Contexto com as ações que mutam o documento/cores, consumidas por nós profundos
// (TableNode) sem prop-drilling pelo React Flow.
import { createContext, useContext } from 'react';

export type CanvasActions = {
  onSelectColumn: (table: string, column: string) => void;
  onRenameColumn: (table: string, oldName: string, newName: string) => void;
  onRenameTable: (tableId: string, newName: string) => void;
  onAddColumn: (table: string) => void;
  colorOf: (tableId: string) => string | undefined;
  onSetColor: (tableId: string, color: string | null) => void;
};

export const CanvasActionsCtx = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions {
  const ctx = useContext(CanvasActionsCtx);
  if (!ctx) throw new Error('CanvasActionsCtx ausente');
  return ctx;
}

/** Paleta de cores para o cabeçalho das tabelas (Unimed + neutros). */
export const TABLE_COLORS = ['#13284b', '#00995d', '#1c3a6b', '#b5651d', '#6b21a8', '#475569'];
