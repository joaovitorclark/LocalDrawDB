// Rotas da API /api — import, persistência e exports.
import type { FastifyInstance } from 'fastify';
import { dbmlToModel, modelToDbml } from './dbmlIo.ts';
import { mergeTables, sqlToTables } from './sqlImport.ts';
import { sparkDDLBySchema } from './ddl/spark.ts';
import { modelToErwinDDL } from './ddl/erwin.ts';
import { modelToMermaid } from './ddl/mermaid.ts';
import { modelToDbtFiles } from './dbtExport.ts';
import {
  loadProject,
  readInputSql,
  saveProject,
  writeOutput,
} from './files.ts';

import type { FastifyReply } from 'fastify';
import type { Model } from './model.ts';

type ProjectBody = { dbml?: string; canvas?: unknown };
type DbmlBody = { dbml?: string };
type PngBody = { pngBase64?: string };

/** Faz parse do DBML; em caso de erro de sintaxe responde 400 e retorna null. */
function parseOr400(dbml: string, reply: FastifyReply): Model | null {
  try {
    return dbmlToModel(dbml);
  } catch (e: any) {
    const msg = e?.diags?.[0]?.error ?? e?.message ?? 'DBML inválido';
    reply.code(400).send({ error: `DBML inválido: ${msg}` });
    return null;
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
    for (const { file, content } of inputs) {
      const tables = sqlToTables(content);
      if (tables.length) {
        merged = mergeTables(merged, tables);
        imported.push(`${file} (${tables.length} tabela(s))`);
      }
    }
    return { dbml: modelToDbml(merged), imported };
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

  // Persiste o PNG do diagrama renderizado no frontend.
  app.post<{ Body: PngBody }>('/api/export/png', async (req) => {
    const data = (req.body?.pngBase64 ?? '').replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(data, 'base64');
    const file = await writeOutput('diagram.png', buf);
    return { file };
  });
}
