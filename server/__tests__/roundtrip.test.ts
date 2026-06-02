import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sqlToTables } from '../sqlImport.ts';
import { dbmlToModel, modelToDbml } from '../dbmlIo.ts';
import { modelToSparkDDL } from '../ddl/spark.ts';
import { modelToErwinDDL } from '../ddl/erwin.ts';
import { modelToMermaid } from '../ddl/mermaid.ts';
import { modelToDbtFiles } from '../dbtExport.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(dir, '..', '__fixtures__', 'sample_schema.sql'), 'utf8');

describe('import SQL -> modelo', () => {
  const tables = sqlToTables(fixture);

  it('lê as duas tabelas', () => {
    expect(tables.map((t) => t.name).sort()).toEqual([
      'canal_venda',
      'origem_pedido',
    ]);
  });

  it('preserva schema, tipos e tamanho de decimal', () => {
    const origem = tables.find((t) => t.name === 'origem_pedido')!;
    expect(origem.schema).toBe('loja');
    const valor = origem.columns.find((c) => c.name === 'valor')!;
    expect(valor.type).toBe('decimal');
    expect(valor.args).toBe('18,2');
  });

  it('detecta PRIMARY KEY e NOT NULL', () => {
    const origem = tables.find((t) => t.name === 'origem_pedido')!;
    const pk = origem.columns.find((c) => c.name === 'cod_origem')!;
    expect(pk.pk).toBe(true);
    expect(pk.nullable).toBe(false);
  });

  it('fallback: importa tipos fora da lista do parser (ex.: VARBINARY)', () => {
    const sql = `CREATE TABLE IF NOT EXISTS t (
      id BIGINT NOT NULL,
      payload VARBINARY,
      valor DECIMAL(18,2),
      PRIMARY KEY (id)
    ) USING DELTA;`;
    const [t] = sqlToTables(sql);
    expect(t.columns.map((c) => c.name)).toEqual(['id', 'payload', 'valor']);
    expect(t.columns.find((c) => c.name === 'payload')!.type).toBe('varbinary');
    expect(t.columns.find((c) => c.name === 'valor')!.args).toBe('18,2');
    const id = t.columns.find((c) => c.name === 'id')!;
    expect(id.pk).toBe(true);
    expect(id.nullable).toBe(false);
  });
});

describe('round-trip modelo <-> DBML', () => {
  const model0 = { tables: sqlToTables(fixture), refs: [] };

  it('modelToDbml -> dbmlToModel preserva tabelas e tipos', () => {
    const dbml = modelToDbml(model0);
    const model1 = dbmlToModel(dbml);
    expect(model1.tables.map((t) => t.name).sort()).toEqual(
      model0.tables.map((t) => t.name).sort(),
    );
    const valor = model1.tables
      .find((t) => t.name === 'origem_pedido')!
      .columns.find((c) => c.name === 'valor')!;
    expect(valor.type).toBe('decimal');
    expect(valor.args).toBe('18,2');
  });
});

describe('refs com schema sobrevivem ao round-trip', () => {
  const dbml = `Table loja.pedido {
  id bigint [pk]
  cliente_id bigint
}
Table loja.cliente {
  id bigint [pk]
}
Ref: loja.pedido.cliente_id > loja.cliente.id
`;

  it('mantém o schema qualificado na ref e re-parseia sem erro', () => {
    const model = dbmlToModel(dbml);
    expect(model.refs).toHaveLength(1);
    expect(model.refs[0].from.table).toBe('loja.pedido');
    expect(model.refs[0].to.table).toBe('loja.cliente');
    // round-trip não pode quebrar o parser (regressão do bug de ref sem schema)
    const reDbml = modelToDbml(model);
    expect(() => dbmlToModel(reDbml)).not.toThrow();
    expect(modelToSparkDDL(dbmlToModel(reDbml))).toContain('loja.pedido');
  });
});

describe('geradores de DDL', () => {
  const model = { tables: sqlToTables(fixture), refs: [] };

  it('Spark DDL usa STRING e DECIMAL(p,s)', () => {
    const ddl = modelToSparkDDL(model);
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS loja.canal_venda');
    expect(ddl).toContain('nom_canal STRING');
    expect(ddl).toContain('valor DECIMAL(18,2)');
    expect(ddl).toContain('USING DELTA');
  });

  it('erwin/ANSI mapeia string->VARCHAR e gera PRIMARY KEY', () => {
    const ddl = modelToErwinDDL(model);
    expect(ddl).toContain('nom_canal VARCHAR(255)');
    expect(ddl).toContain('PRIMARY KEY (cod_origem)');
  });

  it('Mermaid gera erDiagram com entidades e PK', () => {
    const mmd = modelToMermaid(model);
    expect(mmd.startsWith('erDiagram')).toBe(true);
    expect(mmd).toContain('loja_canal_venda {');
    expect(mmd).toContain('decimal valor'); // sem parâmetros no Mermaid
    expect(mmd).toContain('tinyint cod_origem PK');
  });

  it('dbt gera dbt_project.yml, model.sql e schema.yml', () => {
    const files = modelToDbtFiles(model);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('dbt_project.yml');
    expect(paths).toContain('models/loja/canal_venda.sql');
    expect(paths).toContain('models/loja/schema.yml');
  });
});
