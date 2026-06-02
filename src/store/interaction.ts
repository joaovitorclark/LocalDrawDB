// Store de estado efêmero/visual do canvas (padrão Structura).
// O documento (DBML em texto) NÃO mora aqui — só o que é interação/apresentação.
import { create } from 'zustand';

export type SelectedColumn = { table: string; column: string } | null;

type InteractionState = {
  hoveredTableId: string | null;
  setHovered: (id: string | null) => void;
  selectedColumn: SelectedColumn;
  selectColumn: (sel: SelectedColumn) => void;
};

export const useInteraction = create<InteractionState>((set) => ({
  hoveredTableId: null,
  setHovered: (id) => set({ hoveredTableId: id }),
  selectedColumn: null,
  selectColumn: (sel) => set({ selectedColumn: sel }),
}));
