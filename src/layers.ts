import type { Layer } from './api';
import type { ParsedLayerGroup } from './dsl/parse';

// Camadas medallion padrão (cor padrão por camada).
export const BUILTIN_LAYERS: Layer[] = [
  { id: 'bronze', name: 'Bronze', color: '#b08d57' },
  { id: 'prata', name: 'Prata', color: '#9ca3af' },
  { id: 'ouro', name: 'Ouro', color: '#d4af37' },
];
const DEFAULT_COLOR = '#6b7280';

export function allLayers(custom: Layer[]): Layer[] {
  const ids = new Set(BUILTIN_LAYERS.map((l) => l.id));
  return [...BUILTIN_LAYERS, ...custom.filter((l) => !ids.has(l.id))];
}

/** Lista de camadas = built-ins (cor sobreposta por LayerGroup) + LayerGroups novos. */
export function layersFromGroups(groups: ParsedLayerGroup[]): Layer[] {
  const out: Layer[] = BUILTIN_LAYERS.map((b) => {
    const g = groups.find((x) => x.id === b.id);
    return g?.color ? { ...b, color: g.color } : b;
  });
  const builtinIds = new Set(BUILTIN_LAYERS.map((l) => l.id));
  for (const g of groups) {
    if (!builtinIds.has(g.id)) out.push({ id: g.id, name: g.name, color: g.color || DEFAULT_COLOR });
  }
  return out;
}

/** Mapa tabela→camada a partir das adesões nos LayerGroups. */
export function tableLayerMap(groups: ParsedLayerGroup[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const g of groups) for (const t of g.tables) map[t] = g.id;
  return map;
}

export function layerColorOf(layers: Layer[], id?: string): string | undefined {
  return id ? layers.find((l) => l.id === id)?.color : undefined;
}
