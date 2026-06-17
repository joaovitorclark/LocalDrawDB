import type { Layer } from './api';
import type { ParsedLayerGroup } from './dsl/parse';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Camada com hints para geração dbt (fases F2/F4). */
export type LayerPresetLayer = Layer & {
  /** Materialização dbt sugerida para essa camada. */
  materialization?: 'table' | 'view' | 'incremental' | 'ephemeral';
  /** Tipo de recurso dbt sugerido para essa camada. */
  resourceType?: 'model' | 'source' | 'seed' | 'snapshot';
};

/** Um preset de nomenclatura de camadas (ex: medallion-pt, raw-edw-mart). */
export type LayerPreset = {
  id: string;
  name: string;
  layers: LayerPresetLayer[];
};

// ---------------------------------------------------------------------------
// Catálogo de presets
// ---------------------------------------------------------------------------

/**
 * Catálogo de nomenclaturas medallion-style comuns.
 * Ordem dentro de cada preset = da camada mais crua para a mais refinada.
 */
export const LAYER_PRESETS: Record<string, LayerPreset> = {
  'medallion-pt': {
    id: 'medallion-pt',
    name: 'Medallion (pt-BR): Bronze / Prata / Ouro',
    layers: [
      { id: 'bronze', name: 'Bronze', color: '#b08d57', materialization: 'view', resourceType: 'source' },
      { id: 'prata', name: 'Prata', color: '#9ca3af', materialization: 'incremental', resourceType: 'model' },
      { id: 'ouro', name: 'Ouro', color: '#d4af37', materialization: 'table', resourceType: 'model' },
    ],
  },
  'medallion-en': {
    id: 'medallion-en',
    name: 'Medallion (en): Bronze / Silver / Gold',
    layers: [
      { id: 'bronze', name: 'Bronze', color: '#b08d57', materialization: 'view', resourceType: 'source' },
      { id: 'silver', name: 'Silver', color: '#9ca3af', materialization: 'incremental', resourceType: 'model' },
      { id: 'gold', name: 'Gold', color: '#d4af37', materialization: 'table', resourceType: 'model' },
    ],
  },
  'raw-edw-mart': {
    id: 'raw-edw-mart',
    name: 'Raw / EDW / Mart',
    layers: [
      { id: 'raw', name: 'Raw', color: '#92400e', materialization: 'ephemeral', resourceType: 'source' },
      { id: 'edw', name: 'EDW', color: '#6b7280', materialization: 'incremental', resourceType: 'model' },
      { id: 'mart', name: 'Mart', color: '#d4af37', materialization: 'table', resourceType: 'model' },
    ],
  },
  'inbound-staging-solutions': {
    id: 'inbound-staging-solutions',
    name: 'Inbound / Staging / Solutions',
    layers: [
      { id: 'inbound', name: 'Inbound', color: '#92400e', materialization: 'view', resourceType: 'source' },
      { id: 'staging', name: 'Staging', color: '#6b7280', materialization: 'view', resourceType: 'model' },
      { id: 'solutions', name: 'Solutions', color: '#d4af37', materialization: 'table', resourceType: 'model' },
    ],
  },
  'sor-sot-spec': {
    id: 'sor-sot-spec',
    name: 'SOR / SOT / Spec',
    layers: [
      { id: 'sor', name: 'SOR', color: '#92400e', materialization: 'view', resourceType: 'source' },
      { id: 'sot', name: 'SOT', color: '#6b7280', materialization: 'incremental', resourceType: 'model' },
      { id: 'spec', name: 'Spec', color: '#d4af37', materialization: 'table', resourceType: 'model' },
    ],
  },
};

/** Preset padrão — preserva o comportamento atual (bronze/prata/ouro). */
export const DEFAULT_PRESET_ID = 'medallion-pt';

// ---------------------------------------------------------------------------
// KNOWN_LAYERS — dicionário flat: id → LayerPresetLayer (primeira ocorrência)
// ---------------------------------------------------------------------------

/**
 * União de todas as camadas de todos os presets, keyed por id.
 * Primeira ocorrência ganha em caso de colisão (ex: 'bronze' vem de medallion-pt).
 * Usado para auto-coloração e lookup de hints dbt sem precisar saber o preset.
 */
export const KNOWN_LAYERS: Record<string, LayerPresetLayer> = {};
for (const preset of Object.values(LAYER_PRESETS)) {
  for (const layer of preset.layers) {
    if (!(layer.id in KNOWN_LAYERS)) KNOWN_LAYERS[layer.id] = layer;
  }
}

// ---------------------------------------------------------------------------
// Camadas built-in (preserva comportamento atual = preset medallion-pt)
// ---------------------------------------------------------------------------

/** Camadas medallion padrão (cor padrão por camada). Derivadas do preset medallion-pt. */
export const BUILTIN_LAYERS: Layer[] = LAYER_PRESETS[DEFAULT_PRESET_ID].layers.map(
  ({ id, name, color }) => ({ id, name, color }),
);

const DEFAULT_COLOR = '#6b7280';

// ---------------------------------------------------------------------------
// Helpers existentes (assinaturas e comportamentos inalterados)
// ---------------------------------------------------------------------------

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
    if (!builtinIds.has(g.id)) {
      // Se o id for conhecido no catálogo, usa a cor do catálogo; senão DEFAULT_COLOR.
      const catalogColor = KNOWN_LAYERS[g.id]?.color;
      out.push({ id: g.id, name: g.name, color: g.color || catalogColor || DEFAULT_COLOR });
    }
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

// ---------------------------------------------------------------------------
// Helpers dbt (para fases F2/F4)
// ---------------------------------------------------------------------------

/** Materialização dbt sugerida para um id de camada. */
export function materializationForLayer(layerId?: string): string | undefined {
  return layerId ? KNOWN_LAYERS[layerId]?.materialization : undefined;
}

/** Tipo de recurso dbt sugerido para um id de camada. */
export function resourceTypeForLayer(layerId?: string): string | undefined {
  return layerId ? KNOWN_LAYERS[layerId]?.resourceType : undefined;
}
