// Store de estado efêmero/visual do canvas (padrão Structura).
// O documento (DBML em texto) NÃO mora aqui — só o que é interação/apresentação.
import { create } from 'zustand';

export type SelectedColumn = { table: string; column: string } | null;

type InteractionState = {
  hoveredTableId: string | null;
  setHovered: (id: string | null) => void;
  selectedColumn: SelectedColumn;
  selectColumn: (sel: SelectedColumn) => void;

  // Layers (v4): camadas ESCONDIDAS (default vazio = todas visíveis) + modo.
  hiddenLayers: Set<string>;
  toggleLayer: (id: string) => void;
  layerDimMode: boolean; // true = esmaecer escondidas; false = esconder de fato
  toggleDimMode: () => void;

  // Linhagem (v4).
  lineageVisible: boolean;
  toggleLineageVisible: () => void;
  lineageMode: boolean; // arrastar tabela→tabela cria linhagem em vez de PK/FK
  toggleLineageMode: () => void;
};

export const useInteraction = create<InteractionState>((set) => ({
  hoveredTableId: null,
  setHovered: (id) => set({ hoveredTableId: id }),
  selectedColumn: null,
  selectColumn: (sel) => set({ selectedColumn: sel }),

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

  lineageVisible: true,
  toggleLineageVisible: () => set((s) => ({ lineageVisible: !s.lineageVisible })),
  lineageMode: false,
  toggleLineageMode: () => set((s) => ({ lineageMode: !s.lineageMode })),
}));
