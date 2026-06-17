// Testes de round-trip para metadados dbt (F0).
// Valida: serialização, parse e compatibilidade retroativa com DBML sem metadados dbt.

import { describe, expect, it } from 'vitest';
import { dbmlToModel, modelToDbml } from '../dbmlIo.ts';
import { parseDbml } from '../../src/dsl/parse.ts';
import type { Model, Column } from '../model.ts';

// ---- 1. Compatibilidade retroativa ----

describe('compatibilidade retroativa (DBML sem metadados dbt)', () => {
  const DBML_LEGADO = `Table loja.pedido {
  id bigint [pk]
  cliente_id bigint [not null]
  valor decimal(18,2)
}

Table loja.cliente {
  id bigint [pk]
  nome string
}

Ref: loja.pedido.cliente_id > loja.cliente.id
`;

  it('modelToDbml de modelo sem dbt não emite bloco Dbt', () => {
    const model = dbmlToModel(DBML_LEGADO);
    const dbml = modelToDbml(model);
    expect(dbml).not.toContain('Dbt {');
    expect(dbml).not.toContain('resource_type');
    expect(dbml).not.toContain('materialization');
  });

  it('parseDbml tolera DBML legado sem bloco Dbt e não erra', () => {
    const result = parseDbml(DBML_LEGADO);
    expect(result.error).toBeUndefined();
    expect(result.tables).toHaveLength(2);
  });

  it('round-trip de modelo legado produz DBML idêntico (byte-estável)', () => {
    const model = dbmlToModel(DBML_LEGADO);
    const dbml1 = modelToDbml(model);
    const model2 = dbmlToModel(dbml1);
    const dbml2 = modelToDbml(model2);
    expect(dbml2).toBe(dbml1);
  });

  it('campos dbt ausentes resultam em campos undefined no modelo', () => {
    const model = dbmlToModel(DBML_LEGADO);
    for (const t of model.tables) {
      expect(t.resourceType).toBeUndefined();
      expect(t.materialization).toBeUndefined();
      expect(t.tags).toBeUndefined();
      expect(t.dbtMeta).toBeUndefined();
    }
    for (const t of model.tables) {
      for (const c of t.columns) {
        expect(c.tests).toBeUndefined();
      }
    }
  });
});

// ---- 2. Round-trip completo com todos os campos dbt ----

describe('round-trip com metadados dbt completos', () => {
  /** Constrói um modelo rico com todos os campos dbt preenchidos. */
  function buildRichModel(): Model {
    return {
      tables: [
        {
          name: 'pedido',
          schema: 'silver',
          resourceType: 'model',
          materialization: 'incremental',
          tags: ['vendas', 'core'],
          dbtMeta: { owner: 'squad-dados', version: 2 },
          columns: [
            { name: 'id', type: 'bigint', pk: true, nullable: false },
            { name: 'status', type: 'string', nullable: true, tests: [
              { kind: 'accepted_values', values: ['ativo', 'cancelado', 'pendente'] },
            ] },
            { name: 'email', type: 'string', nullable: false, unique: true },
            // not_null é derivado de nullable===false; unique é nativo DBML [unique]
          ],
        },
        {
          name: 'dim_produto',
          schema: 'gold',
          resourceType: 'seed',
          materialization: 'table',
          tags: ['catalogo'],
          dbtMeta: { deprecated: true },
          columns: [
            { name: 'sku', type: 'string', pk: true, nullable: false },
            { name: 'categoria', type: 'string', tests: [
              { kind: 'accepted_values', values: ['eletronico', 'vestuario'] },
            ] },
          ],
        },
        {
          // Tabela sem qualquer metadado dbt — não deve gerar sub-bloco no Dbt { }
          name: 'log_evento',
          schema: 'raw',
          columns: [
            { name: 'id', type: 'bigint', pk: true, nullable: false },
            { name: 'evento', type: 'string' },
          ],
        },
      ],
      refs: [],
    };
  }

  it('modelToDbml emite bloco Dbt { } com tabelas dbt', () => {
    const dbml = modelToDbml(buildRichModel());
    expect(dbml).toContain('Dbt {');
    expect(dbml).toContain('table silver.pedido {');
    expect(dbml).toContain('resource_type: model');
    expect(dbml).toContain('materialization: incremental');
    expect(dbml).toContain("tags: ['vendas', 'core']");
    expect(dbml).toContain("meta {");
    expect(dbml).toContain("owner: 'squad-dados'");
    expect(dbml).toContain('version: 2');
  });

  it('tabela sem metadados dbt não aparece no bloco Dbt { }', () => {
    const dbml = modelToDbml(buildRichModel());
    expect(dbml).not.toContain('table raw.log_evento');
  });

  it('accepted_values são serializados no bloco columns { }', () => {
    const dbml = modelToDbml(buildRichModel());
    expect(dbml).toContain('columns {');
    expect(dbml).toContain("accepted_values: ['ativo', 'cancelado', 'pendente']");
    expect(dbml).toContain("accepted_values: ['eletronico', 'vestuario']");
  });

  it('unique é serializado como [unique] nativo no DBML da coluna', () => {
    const dbml = modelToDbml(buildRichModel());
    expect(dbml).toContain('email string [not null, unique]');
  });

  it('parseDbml tolera bloco Dbt sem erros', () => {
    const dbml = modelToDbml(buildRichModel());
    const result = parseDbml(dbml);
    expect(result.error).toBeUndefined();
    expect(result.tables.length).toBeGreaterThan(0);
  });

  it('round-trip lossless: todos os campos dbt sobrevivem modelo→DBML→modelo', () => {
    const original = buildRichModel();
    const dbml = modelToDbml(original);
    const restored = dbmlToModel(dbml);

    // Tabela silver.pedido
    const pedido = restored.tables.find(
      (t) => t.name === 'pedido' && t.schema === 'silver',
    )!;
    expect(pedido).toBeDefined();
    expect(pedido.resourceType).toBe('model');
    expect(pedido.materialization).toBe('incremental');
    expect(pedido.tags).toEqual(['vendas', 'core']);
    expect(pedido.dbtMeta).toMatchObject({ owner: 'squad-dados', version: 2 });

    // Coluna com accepted_values
    const status = pedido.columns.find((c) => c.name === 'status')!;
    expect(status.tests).toHaveLength(1);
    expect(status.tests![0]).toEqual({
      kind: 'accepted_values',
      values: ['ativo', 'cancelado', 'pendente'],
    });

    // Coluna com unique nativo
    const email = pedido.columns.find((c) => c.name === 'email')!;
    expect(email.unique).toBe(true);
    expect(email.nullable).toBe(false);

    // Tabela gold.dim_produto
    const produto = restored.tables.find(
      (t) => t.name === 'dim_produto' && t.schema === 'gold',
    )!;
    expect(produto.resourceType).toBe('seed');
    expect(produto.materialization).toBe('table');
    expect(produto.tags).toEqual(['catalogo']);
    expect(produto.dbtMeta).toMatchObject({ deprecated: true });

    const categoria = produto.columns.find((c) => c.name === 'categoria')!;
    expect(categoria.tests![0]).toEqual({
      kind: 'accepted_values',
      values: ['eletronico', 'vestuario'],
    });

    // Tabela sem dbt
    const log = restored.tables.find((t) => t.name === 'log_evento')!;
    expect(log.resourceType).toBeUndefined();
    expect(log.materialization).toBeUndefined();
    expect(log.tags).toBeUndefined();
    expect(log.dbtMeta).toBeUndefined();
  });

  it('round-trip duplo é idempotente (modelo→DBML→modelo→DBML = mesmo DBML)', () => {
    const dbml1 = modelToDbml(buildRichModel());
    const dbml2 = modelToDbml(dbmlToModel(dbml1));
    expect(dbml2).toBe(dbml1);
  });
});

// ---- 3. Testes accepted_values (vários tipos de kind) ----

describe('ColumnTest kinds via derivação', () => {
  it('not_null derivado de nullable===false (coluna não-PK)', () => {
    const model: Model = {
      tables: [{
        name: 'evento',
        columns: [
          { name: 'id', type: 'bigint', pk: true, nullable: false },
          { name: 'codigo', type: 'string', nullable: false }, // not null mas não pk
        ],
      }],
      refs: [],
    };
    const dbml = modelToDbml(model);
    expect(dbml).toContain('codigo string [not null]');
    // Coluna pk: não duplica not null separado (já usa pk)
    expect(dbml).toContain('id bigint [pk]');
    expect(dbml).not.toContain('id bigint [pk, not null]');
  });

  it('unique nativo sobrevive round-trip completo', () => {
    const dbmlIn = `Table t {
  id bigint [pk]
  email string [not null, unique]
  codigo string [unique]
}
`;
    const model = dbmlToModel(dbmlIn);
    const emailCol = model.tables[0].columns.find((c) => c.name === 'email')!;
    expect(emailCol.unique).toBe(true);
    expect(emailCol.nullable).toBe(false);

    const codigoCol = model.tables[0].columns.find((c) => c.name === 'codigo')!;
    expect(codigoCol.unique).toBe(true);

    const dbmlOut = modelToDbml(model);
    expect(dbmlOut).toContain('email string [not null, unique]');
    expect(dbmlOut).toContain('codigo string [unique]');
  });

  it('relationships derivados de Refs existentes (sem armazenamento duplicado)', () => {
    // relationships tests mapeiam para Refs; verificamos que Refs sobrevivem round-trip
    const model: Model = {
      tables: [
        { name: 'pedido', columns: [
          { name: 'id', type: 'bigint', pk: true },
          { name: 'cliente_id', type: 'bigint', nullable: false },
        ]},
        { name: 'cliente', columns: [{ name: 'id', type: 'bigint', pk: true }] },
      ],
      refs: [{ from: { table: 'pedido', column: 'cliente_id' }, to: { table: 'cliente', column: 'id' }, kind: '>' }],
    };
    const dbml = modelToDbml(model);
    const restored = dbmlToModel(dbml);
    expect(restored.refs).toHaveLength(1);
    expect(restored.refs[0].from.table).toBe('pedido');
    expect(restored.refs[0].from.column).toBe('cliente_id');
    expect(restored.refs[0].to.table).toBe('cliente');
    expect(restored.refs[0].to.column).toBe('id');
  });
});

// ---- 4. Metadados parciais (só um ou dois campos) ----

describe('metadados dbt parciais', () => {
  it('só materialization emite bloco Dbt mínimo', () => {
    const model: Model = {
      tables: [{
        name: 'fatos',
        schema: 'gold',
        materialization: 'table',
        columns: [{ name: 'id', type: 'bigint', pk: true }],
      }],
      refs: [],
    };
    const dbml = modelToDbml(model);
    expect(dbml).toContain('Dbt {');
    expect(dbml).toContain('table gold.fatos {');
    expect(dbml).toContain('materialization: table');
    expect(dbml).not.toContain('resource_type');
    expect(dbml).not.toContain('tags');

    const restored = dbmlToModel(dbml);
    const t = restored.tables[0];
    expect(t.materialization).toBe('table');
    expect(t.resourceType).toBeUndefined();
    expect(t.tags).toBeUndefined();
  });

  it('só tags emite bloco Dbt com lista de tags', () => {
    const model: Model = {
      tables: [{
        name: 'dim',
        tags: ['marketing', 'kpi'],
        columns: [{ name: 'id', type: 'bigint', pk: true }],
      }],
      refs: [],
    };
    const dbml = modelToDbml(model);
    expect(dbml).toContain("tags: ['marketing', 'kpi']");

    const restored = dbmlToModel(dbml);
    expect(restored.tables[0].tags).toEqual(['marketing', 'kpi']);
  });

  it('só accepted_values emite bloco Dbt com columns { }', () => {
    const model: Model = {
      tables: [{
        name: 'dim_status',
        columns: [
          { name: 'id', type: 'bigint', pk: true },
          { name: 'status', type: 'string', tests: [
            { kind: 'accepted_values', values: ['A', 'B'] },
          ]},
        ],
      }],
      refs: [],
    };
    const dbml = modelToDbml(model);
    expect(dbml).toContain('Dbt {');
    expect(dbml).toContain('columns {');
    expect(dbml).toContain("accepted_values: ['A', 'B']");

    const restored = dbmlToModel(dbml);
    const statusCol = restored.tables[0].columns.find((c) => c.name === 'status')!;
    expect(statusCol.tests).toHaveLength(1);
    expect(statusCol.tests![0]).toEqual({ kind: 'accepted_values', values: ['A', 'B'] });
  });

  it('dbtMeta vazio não emite meta { }', () => {
    const model: Model = {
      tables: [{
        name: 't',
        dbtMeta: {},
        columns: [{ name: 'id', type: 'bigint', pk: true }],
      }],
      refs: [],
    };
    const dbml = modelToDbml(model);
    // dbtMeta vazio não deve emitir bloco Dbt nem meta { }
    expect(dbml).not.toContain('meta {');
  });
});

// ---- 5. Bloco Dbt no DBML tolera parseDbml sem erro ----

describe('front-end parse.ts tolera bloco Dbt', () => {
  const DBML_COM_DBT = `Table gold.fatos {
  id bigint [pk]
  status string [not null, unique]
  categoria string
}

Dbt {
  table gold.fatos {
    resource_type: model
    materialization: incremental
    tags: ['core', 'gold']
    meta {
      owner: 'squad-bi'
    }
    columns {
      categoria {
        accepted_values: ['A', 'B', 'C']
      }
    }
  }
}
`;

  it('parseDbml não retorna erro com bloco Dbt', () => {
    const result = parseDbml(DBML_COM_DBT);
    expect(result.error).toBeUndefined();
  });

  it('parseDbml retorna tabela corretamente (Dbt stripped antes do @dbml/core)', () => {
    const result = parseDbml(DBML_COM_DBT);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].id).toBe('gold.fatos');
    expect(result.tables[0].name).toBe('fatos');
    const statusCol = result.tables[0].columns.find((c) => c.name === 'status');
    expect(statusCol?.notNull).toBe(true);
  });
});
