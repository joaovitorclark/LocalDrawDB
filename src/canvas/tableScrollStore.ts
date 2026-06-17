import { create } from 'zustand';

/** scrollTop por nó de tabela (colunas com barra interna). */
type TableScrollState = {
  byNode: Record<string, number>;
  /** Incrementa a cada scroll — força re-render das arestas. */
  version: number;
  setScrollTop: (nodeId: string, scrollTop: number) => void;
};

export const useTableScrollStore = create<TableScrollState>((set) => ({
  byNode: {},
  version: 0,
  setScrollTop: (nodeId, scrollTop) =>
    set((s) => {
      if (s.byNode[nodeId] === scrollTop) return s;
      return {
        byNode: { ...s.byNode, [nodeId]: scrollTop },
        version: s.version + 1,
      };
    }),
}));
