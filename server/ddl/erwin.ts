import { typeToAnsi } from '../model.ts';
import type { Model } from '../model.ts';
import { modelToScriptDDL, scriptDDLBySchema } from './scriptDdl.ts';

const HEADER = '-- LocalDrawDB: script para Reverse Engineer from Script (erwin Data Modeler)';

/** Script DDL ANSI único (tabelas + FKs) para reverse-engineer no erwin. */
export function modelToErwinDDL(model: Model): string {
  return modelToScriptDDL(model, typeToAnsi, HEADER);
}
