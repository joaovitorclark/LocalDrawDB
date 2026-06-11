import { typeToOracle } from '../model.ts';
import type { Model } from '../model.ts';
import { modelToScriptDDL, scriptDDLBySchema } from './scriptDdl.ts';

const HEADER = '-- LocalDrawDB: DDL Oracle';

/** DDL Oracle de todas as tabelas (um script). */
export function modelToOracleDDL(model: Model): string {
  return modelToScriptDDL(model, typeToOracle, HEADER);
}

/** DDL Oracle agrupado por schema -> { 'schema.sql': conteúdo }. */
export function oracleDDLBySchema(model: Model): Record<string, string> {
  return scriptDDLBySchema(model, typeToOracle, HEADER);
}
