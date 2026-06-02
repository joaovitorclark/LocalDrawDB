// Store de estado efêmero/visual do canvas (padrão Structura).
// O documento (DBML em texto) NÃO mora aqui — só o que é interação/apresentação.
import { create } from 'zustand';

export type SelectedColumn = { table: string; column: string } | null;

type InteractionState = {
  hoveredTableId: string | null;
  setHovered: (id: string | null) => void;
  selectedColumn: SelectedColumn;
  selectColumn: (sel: SelectedColumn) => void;
  selectedTable: string | null;
  selectTable: (id: string | null) => void;
  selectedGroup: string | null;
  selectGroup: (id: string | null) => void;

  // Layers (v4): camadas ESCONDIDAS (default vazio = todas visíveis) + modo.
  hiddenLayers: Set<string>;
  toggleLayer: (id: string) => void;
  layerDimMode: boolean; // true = esmaecer escondidas; false = esconder de fato
  toggleDimMode: () => void;

  // Linhagem: visualizar arestas vs editar (modo compacto + portas).
  lineageVisible: boolean;
  toggleLineageVisible: () => void;
  lineageMode: boolean;
  toggleLineageMode: () => void;
};

export const useInteraction = create<InteractionState>((set) => ({
  hoveredTableId: null,
  setHovered: (id) => set({ hoveredTableId: id }),
  selectedColumn: null,
  selectColumn: (sel) => set({ selectedColumn: sel }),
  selectedTable: null,
  selectTable: (id) => set({ selectedTable: id, selectedGroup: null }),
  selectedGroup: null,
  selectGroup: (id) => set({ selectedGroup: id, selectedTable: null }),

  hiddenLayers: new Set<string>(),
  toggleLayer: (id) =>
    set((s) => {
      const next = new Set(s.hiddenLayers);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { hiddenLayers: next };
    }),
  layerDimMode: true,
  toggleDimMode: () => set((s) => ({ layerDimMode: !s.layerDimMode })),

  lineageVisible: false,
  toggleLineageVisible: () => set((s) => ({ lineageVisible: !s.lineageVisible })),
  lineageMode: false,
  toggleLineageMode: () =>
    set((s) => {
      const next = !s.lineageMode;
      return { lineageMode: next, lineageVisible: next ? true : s.lineageVisible };
    }),
}));
