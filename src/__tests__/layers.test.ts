import { describe, it, expect } from 'vitest';
import {
  BUILTIN_LAYERS,
  LAYER_PRESETS,
  KNOWN_LAYERS,
  DEFAULT_PRESET_ID,
  allLayers,
  layersFromGroups,
  materializationForLayer,
  resourceTypeForLayer,
} from '../layers';

// ---------------------------------------------------------------------------
// BUILTIN_LAYERS — comportamento inalterado
// ---------------------------------------------------------------------------
describe('BUILTIN_LAYERS', () => {
  it('continua sendo bronze/prata/ouro com as cores originais', () => {
    expect(BUILTIN_LAYERS).toHaveLength(3);
    expect(BUILTIN_LAYERS[0]).toMatchObject({ id: 'bronze', name: 'Bronze', color: '#b08d57' });
    expect(BUILTIN_LAYERS[1]).toMatchObject({ id: 'prata', name: 'Prata', color: '#9ca3af' });
    expect(BUILTIN_LAYERS[2]).toMatchObject({ id: 'ouro', name: 'Ouro', color: '#d4af37' });
  });
});

// ---------------------------------------------------------------------------
// LAYER_PRESETS — catálogo de nomenclaturas
// ---------------------------------------------------------------------------
describe('LAYER_PRESETS', () => {
  it('contém todos os presets obrigatórios', () => {
    const ids = Object.keys(LAYER_PRESETS);
    expect(ids).toContain('medallion-pt');
    expect(ids).toContain('medallion-en');
    expect(ids).toContain('raw-edw-mart');
    expect(ids).toContain('inbound-staging-solutions');
    expect(ids).toContain('sor-sot-spec');
  });

  it('cada preset tem id, name e lista de camadas com ao menos 2 entradas', () => {
    for (const [key, preset] of Object.entries(LAYER_PRESETS)) {
      expect(preset.id).toBe(key);
      expect(typeof preset.name).toBe('string');
      expect(Array.isArray(preset.layers)).toBe(true);
      expect(preset.layers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cada camada dos presets tem id, name, color e hints dbt opcionais', () => {
    const validMat = ['table', 'view', 'incremental', 'ephemeral', undefined];
    const validRes = ['model', 'source', 'seed', 'snapshot', undefined];
    for (const preset of Object.values(LAYER_PRESETS)) {
      for (const layer of preset.layers) {
        expect(typeof layer.id).toBe('string');
        expect(typeof layer.name).toBe('string');
        expect(typeof layer.color).toBe('string');
        expect(layer.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(validMat).toContain(layer.materialization);
        expect(validRes).toContain(layer.resourceType);
      }
    }
  });

  it('preset medallion-pt preserva ids/cores bronze-prata-ouro', () => {
    const pt = LAYER_PRESETS['medallion-pt'];
    expect(pt.layers[0]).toMatchObject({ id: 'bronze', color: '#b08d57' });
    expect(pt.layers[1]).toMatchObject({ id: 'prata', color: '#9ca3af' });
    expect(pt.layers[2]).toMatchObject({ id: 'ouro', color: '#d4af37' });
  });

  it('DEFAULT_PRESET_ID aponta para medallion-pt', () => {
    expect(DEFAULT_PRESET_ID).toBe('medallion-pt');
  });
});

// ---------------------------------------------------------------------------
// KNOWN_LAYERS — dicionário flat de todas as camadas
// ---------------------------------------------------------------------------
describe('KNOWN_LAYERS', () => {
  it('indexa layers de todos os presets pelo id', () => {
    // bronze vem de medallion-pt
    expect(KNOWN_LAYERS['bronze']).toBeDefined();
    expect(KNOWN_LAYERS['bronze'].color).toBe('#b08d57');
    // silver vem de medallion-en
    expect(KNOWN_LAYERS['silver']).toBeDefined();
    // raw vem de raw-edw-mart
    expect(KNOWN_LAYERS['raw']).toBeDefined();
    // inbound vem de inbound-staging-solutions
    expect(KNOWN_LAYERS['inbound']).toBeDefined();
    // sor vem de sor-sot-spec
    expect(KNOWN_LAYERS['sor']).toBeDefined();
  });

  it('id desconhecido retorna undefined', () => {
    expect(KNOWN_LAYERS['nao-existe']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// materializationForLayer / resourceTypeForLayer
// ---------------------------------------------------------------------------
describe('materializationForLayer', () => {
  it('camada tipo raw/source retorna view ou ephemeral', () => {
    const mat = materializationForLayer('raw');
    expect(['view', 'ephemeral']).toContain(mat);
  });

  it('camada mart/ouro retorna table', () => {
    expect(materializationForLayer('mart')).toBe('table');
    expect(materializationForLayer('ouro')).toBe('table');
  });

  it('id desconhecido retorna undefined', () => {
    expect(materializationForLayer('nao-existe')).toBeUndefined();
  });

  it('sem argumento retorna undefined', () => {
    expect(materializationForLayer()).toBeUndefined();
  });
});

describe('resourceTypeForLayer', () => {
  it('camada raw/inbound retorna source', () => {
    expect(resourceTypeForLayer('raw')).toBe('source');
    expect(resourceTypeForLayer('inbound')).toBe('source');
  });

  it('camada mart/ouro retorna model', () => {
    expect(resourceTypeForLayer('mart')).toBe('model');
    expect(resourceTypeForLayer('ouro')).toBe('model');
  });

  it('id desconhecido retorna undefined', () => {
    expect(resourceTypeForLayer('nao-existe')).toBeUndefined();
  });

  it('sem argumento retorna undefined', () => {
    expect(resourceTypeForLayer()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// allLayers — comportamento inalterado
// ---------------------------------------------------------------------------
describe('allLayers', () => {
  it('sem custom retorna exatamente bronze/prata/ouro', () => {
    const layers = allLayers([]);
    expect(layers).toHaveLength(3);
    expect(layers.map((l) => l.id)).toEqual(['bronze', 'prata', 'ouro']);
  });

  it('adiciona camadas customizadas não-built-in', () => {
    const custom = [
      { id: 'ouro', name: 'Ouro', color: '#fff' }, // deve ser ignorado (built-in)
      { id: 'custom', name: 'Custom', color: '#123456' },
    ];
    const layers = allLayers(custom);
    expect(layers.map((l) => l.id)).toEqual(['bronze', 'prata', 'ouro', 'custom']);
    // ouro mantém cor original (built-in tem precedência)
    expect(layers.find((l) => l.id === 'ouro')?.color).toBe('#d4af37');
  });
});

// ---------------------------------------------------------------------------
// layersFromGroups — auto-coloração de ids conhecidos
// ---------------------------------------------------------------------------
describe('layersFromGroups', () => {
  it('sem grupos retorna os três built-ins', () => {
    const layers = layersFromGroups([]);
    expect(layers.map((l) => l.id)).toEqual(['bronze', 'prata', 'ouro']);
  });

  it('grupo com cor explícita sobrepõe built-in', () => {
    const layers = layersFromGroups([
      { id: 'bronze', name: 'Bronze', color: '#ff0000', tables: [] },
    ]);
    expect(layers.find((l) => l.id === 'bronze')?.color).toBe('#ff0000');
  });

  it('grupo referenciando id de preset conhecido (silver) usa cor do catálogo', () => {
    const layers = layersFromGroups([
      { id: 'silver', name: 'Silver', color: undefined, tables: [] },
    ]);
    const silver = layers.find((l) => l.id === 'silver');
    expect(silver).toBeDefined();
    // deve usar a cor do catálogo, não DEFAULT_COLOR (#6b7280)
    expect(silver?.color).toBe(KNOWN_LAYERS['silver'].color);
    expect(silver?.color).not.toBe('#6b7280');
  });

  it('grupo com id totalmente desconhecido usa DEFAULT_COLOR', () => {
    const layers = layersFromGroups([
      { id: 'xpto', name: 'Xpto', color: undefined, tables: [] },
    ]);
    const xpto = layers.find((l) => l.id === 'xpto');
    expect(xpto?.color).toBe('#6b7280');
  });

  it('NÃO injeta todas as camadas do catálogo, só as explicitamente referenciadas', () => {
    // silver é referenciado, gold NÃO é
    const layers = layersFromGroups([
      { id: 'silver', name: 'Silver', color: undefined, tables: [] },
    ]);
    expect(layers.find((l) => l.id === 'gold')).toBeUndefined();
  });
});
