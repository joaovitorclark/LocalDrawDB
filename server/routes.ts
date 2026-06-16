import type { FastifyInstance, FastifyReply } from 'fastify';
import { dbmlToModel, modelToDbml } from './dbmlIo.ts';
import { mergeModel, sqlToModel } from './sqlImport.ts';
import {
  DATA_DIR,
  INPUT_DIR,
  ROOT,
  loadProject,
  readInputSql,
  saveProject,
  writeOutput,
} from './files.ts';
import type { Model } from './model.ts';
import { registerExportRoutes } from './routes/exportRoutes.ts';

type ProjectBody = { dbml?: string; canvas?: unknown };
type DbmlBody = { dbml?: string };
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
  app.get('/api/meta', async () => ({
    root: ROOT,
    dataDir: DATA_DIR,
    inputDir: INPUT_DIR,
    port: Number(process.env.PORT ?? 5174),
  }));

  app.get('/api/project', async () => loadProject());

  app.put<{ Body: ProjectBody }>('/api/project', async (req) => {
    const { dbml = '', canvas = {} } = req.body ?? {};
    await saveProject(dbml, canvas);
    return { ok: true };
  });

  app.post<{ Body: DbmlBody }>('/api/import', async (req) => {
    const baseDbml = req.body?.dbml ?? '';
    const warnings: string[] = [];
    let model: Model = { tables: [], refs: [] };
    if (baseDbml.trim()) {
      try {
        model = dbmlToModel(baseDbml);
      } catch (e: any) {
        const msg = e?.diags?.[0]?.message ?? e?.diags?.[0]?.error ?? e?.message ?? 'DBML inválido';
        warnings.push(`DBML do projeto ignorado: ${msg}`);
      }
    }
    const inputs = await readInputSql();
    let merged = model;
    const imported: string[] = [];
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

  registerExportRoutes(app, parseOr400);

  app.post<{ Body: PngBody }>('/api/export/png', async (req) => {
    const data = (req.body?.pngBase64 ?? '').replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(data, 'base64');
    const file = await writeOutput('diagram.png', buf);
    return { file };
  });
}
