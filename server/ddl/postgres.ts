import { typeToPostgres } from '../model.ts';
import type { Model } from '../model.ts';
import { modelToScriptDDL, scriptDDLBySchema } from './scriptDdl.ts';

const HEADER = '-- LocalDrawDB: DDL PostgreSQL';

/** DDL PostgreSQL de todas as tabelas (um script). */
export function modelToPostgresDDL(model: Model): string {
  return modelToScriptDDL(model, typeToPostgres, HEADER);
}

/** DDL PostgreSQL agrupado por schema -> { 'schema.sql': conteúdo }. */
export function postgresDDLBySchema(model: Model): Record<string, string> {
  return scriptDDLBySchema(model, typeToPostgres, HEADER);
}
