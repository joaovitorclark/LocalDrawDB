import type { Layer } from './api';

// Camadas medallion padrão (cor padrão por camada).
export const BUILTIN_LAYERS: Layer[] = [
  { id: 'bronze', name: 'Bronze', color: '#b08d57' },
  { id: 'prata', name: 'Prata', color: '#9ca3af' },
  { id: 'ouro', name: 'Ouro', color: '#d4af37' },
];

export function allLayers(custom: Layer[]): Layer[] {
  const ids = new Set(BUILTIN_LAYERS.map((l) => l.id));
  return [...BUILTIN_LAYERS, ...custom.filter((l) => !ids.has(l.id))];
}

export function layerColorOf(layers: Layer[], id?: string): string | undefined {
  return id ? layers.find((l) => l.id === id)?.color : undefined;
}
