// Rotas da API /api — import, persistência e exports.
import type { FastifyInstance } from 'fastify';
import { dbmlToModel, modelToDbml } from './dbmlIo.ts';
import { mergeModel, sqlToModel } from './sqlImport.ts';
import { sparkDDLBySchema } from './ddl/spark.ts';
import { modelToErwinDDL } from './ddl/erwin.ts';
import { modelToMermaid } from './ddl/mermaid.ts';
import { modelToDbtFiles } from './dbtExport.ts';
import { modelToInputSql, type InputDialect } from './sqlExport.ts';
import {
  DATA_DIR,
  INPUT_DIR,
  ROOT,
  loadProject,
  readInputSql,
  saveProject,
  writeOutput,
} from './files.ts';

import type { FastifyReply } from 'fastify';
import type { Model } from './model.ts';

type ProjectBody = { dbml?: string; canvas?: unknown };
type DbmlBody = { dbml?: string };
type InputBody = { dbml?: string; dialect?: InputDialect };
type PngBody = { pngBase64?: string };

/** Faz parse do DBML; em caso de erro de sintaxe responde 400 e retorna null. */
function parseOr400(dbml: string, reply: FastifyReply): Model | null {
  try {
    return dbmlToModel(dbml);
  } catch (e: any) {
    const msg = e?.diags?.[0]?.message ?? e?.diags?.[0]?.error ?? e?.message ?? 'DBML inválido';
    reply.code(400).send({ error: `DBML inválido: ${msg}` });
    return null;
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Metadados do clone atual (debug: confirmar qual data/input/ esta ativo).
  app.get('/api/meta', async () => ({
    root: ROOT,
    dataDir: DATA_DIR,
    inputDir: INPUT_DIR,
    port: Number(process.env.PORT ?? 5174),
  }));

  // Carrega o projeto persistido (DBML + canvas).
  app.get('/api/project', async () => loadProject());

  // Salva o projeto.
  app.put<{ Body: ProjectBody }>('/api/project', async (req) => {
    const { dbml = '', canvas = {} } = req.body ?? {};
    await saveProject(dbml, canvas);
    return { ok: true };
  });

  // Importa os .sql de data/input/ e devolve o DBML mesclado.
  app.post<{ Body: DbmlBody }>('/api/import', async (req) => {
    const baseDbml = req.body?.dbml ?? '';
    const model = baseDbml.trim() ? dbmlToModel(baseDbml) : { tables: [], refs: [] };
    const inputs = await readInputSql();
    let merged = model;
    const imported: string[] = [];
    const warnings: string[] = [];
    for (const { file, content } of inputs) {
      const incoming = sqlToModel(content);
      if (incoming.warnings?.length) {
        for (const w of incoming.warnings) warnings.push(`${file}: ${w}`);
      }
      if (incoming.tables.length) {
        merged = mergeModel(merged, incoming);
        const refCount = incoming.refs.length;
        imported.push(
          `${file} (${incoming.tables.length} tabela(s)${refCount ? `, ${refCount} ref(s)` : ''})`,
        );
      }
    }
    return {
      dbml: modelToDbml(merged),
      imported,
      lineageFieldCount: merged.lineageFields?.length ?? 0,
      warnings: warnings.length ? warnings : undefined,
    };
  });

  // Exporta DDL Spark por schema para data/output/.
  app.post<{ Body: DbmlBody }>('/api/export/ddl', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    const files = sparkDDLBySchema(model);
    const written: string[] = [];
    for (const [name, content] of Object.entries(files)) {
      written.push(await writeOutput(`spark/${name}`, content));
    }
    return { files: written };
  });

  // Exporta projeto dbt para data/output/dbt/.
  app.post<{ Body: DbmlBody }>('/api/export/dbt', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    const written: string[] = [];
    for (const f of modelToDbtFiles(model)) {
      written.push(await writeOutput(`dbt/${f.path}`, f.content));
    }
    return { files: written };
  });

  // Exporta script DDL para reverse-engineer no erwin.
  app.post<{ Body: DbmlBody }>('/api/export/erwin', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    const file = await writeOutput('erwin/modelo.sql', modelToErwinDDL(model));
    return { files: [file] };
  });

  // Exporta diagrama Mermaid (erDiagram).
  app.post<{ Body: DbmlBody }>('/api/export/mermaid', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    const file = await writeOutput('mermaid/modelo.mmd', modelToMermaid(model));
    return { files: [file] };
  });

  // Exporta SQL no formato data/input/ (Spark ou Oracle).
  app.post<{ Body: InputBody }>('/api/export/input', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    const dialect = req.body?.dialect ?? 'spark';
    const content = modelToInputSql(model, dialect);
    const filename =
      dialect === 'oracle' ? 'lakehouse_oracle.sql' : 'lakehouse_export.sql';
    const file = await writeOutput(`input/${filename}`, content);
    return { files: [file] };
  });

  // Persiste o PNG do diagrama renderizado no frontend.
  app.post<{ Body: PngBody }>('/api/export/png', async (req) => {
    const data = (req.body?.pngBase64 ?? '').replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(data, 'base64');
    const file = await writeOutput('diagram.png', buf);
    return { file };
  });
}
