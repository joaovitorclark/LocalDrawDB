import type { FastifyInstance } from 'fastify';
import { runExport, type ExportFormat } from '../exportDispatch.ts';
import type { Model } from '../model.ts';
import type { InputDialect } from '../sqlExport.ts';

type ExportBody = { dbml?: string; format?: ExportFormat; dialect?: InputDialect };

export async function handleExport(model: Model, body: ExportBody): Promise<{ files: string[] }> {
  const format = body.format ?? 'spark-ddl';
  const files = await runExport(model, { format, dialect: body.dialect });
  return { files };
}

export function registerExportRoutes(
  app: FastifyInstance,
  parseOr400: (dbml: string, reply: any) => Model | null,
): void {
  app.post<{ Body: ExportBody }>('/api/export', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, req.body ?? {});
  });

  // Aliases (compatibilidade com scripts E2E e clientes antigos)
  app.post<{ Body: { dbml?: string } }>('/api/export/ddl', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, { format: 'spark-ddl' });
  });

  app.post<{ Body: { dbml?: string; dialect?: InputDialect } }>('/api/export/input', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, {
      format: 'localdrawdb',
      dialect: req.body?.dialect ?? 'spark',
    });
  });

  app.post<{ Body: { dbml?: string; dialect?: InputDialect } }>('/api/export/localdrawdb', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, {
      format: 'localdrawdb',
      dialect: req.body?.dialect ?? 'spark',
    });
  });

  app.post<{ Body: { dbml?: string } }>('/api/export/dbt', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, { format: 'dbt' });
  });

  app.post<{ Body: { dbml?: string } }>('/api/export/erwin', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, { format: 'erwin' });
  });

  app.post<{ Body: { dbml?: string } }>('/api/export/mermaid', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, { format: 'mermaid' });
  });

  app.post<{ Body: { dbml?: string } }>('/api/export/oracle-ddl', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, { format: 'oracle-ddl' });
  });

  app.post<{ Body: { dbml?: string } }>('/api/export/postgres-ddl', async (req, reply) => {
    const model = parseOr400(req.body?.dbml ?? '', reply);
    if (!model) return reply;
    return handleExport(model, { format: 'postgres-ddl' });
  });
}
