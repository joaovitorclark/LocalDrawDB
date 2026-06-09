import { describe, expect, it } from 'vitest';
import { extractRecords } from '../dbmlClean';
import { lineOfGroupMember, resolveParseErrorLine, tableAtLine, tableIdFromParseError, resolveTableId } from '../lineLocate';
import { parseDbml } from '../parse';

const DBML_WITH_STRIPPED = `Table silver.dim_cbo {
  id bigint [pk]
}

LayerGroup bronze {
  raw.old_table
}

TableGroup silver_grp {
  silver.dim_cbo
  silver.dim_ccontrato
}

Table silver.dim_cnes {
  id bigint [pk]
}
`;

describe('lineLocate — erros de parse', () => {
  it('extrai schema.tabela da mensagem do @dbml/core', () => {
    expect(tableIdFromParseError('Can\'t find table "silver"."dim_ccontrato"')).toBe(
      'silver.dim_ccontrato',
    );
    expect(tableIdFromParseError('Table "silver".dim_ccontrato don\'t exist')).toBe(
      'silver.dim_ccontrato',
    );
  });

  it('lineOfGroupMember aponta a linha correta no LayerGroup/TableGroup', () => {
    const lgLine = lineOfGroupMember(DBML_WITH_STRIPPED, 'silver.dim_ccontrato');
    const src = DBML_WITH_STRIPPED.split('\n');
    expect(src[lgLine!]).toContain('dim_ccontrato');
    expect(src[lgLine!]).not.toContain('dim_cbo');
  });

  it('resolveParseErrorLine prefere linha do membro citado no erro', () => {
    const { mapCleanLineToOriginal } = extractRecords(DBML_WITH_STRIPPED);
    const msg = 'Can\'t find table "silver"."dim_ccontrato"';
    const cleanLine = 4; // linha errada no buffer clean (ex.: dim_cbo)
    const resolved = resolveParseErrorLine(DBML_WITH_STRIPPED, msg, cleanLine, mapCleanLineToOriginal);
    const src = DBML_WITH_STRIPPED.split('\n');
    expect(src[resolved!]).toContain('dim_ccontrato');
  });

  it('parseDbml reporta linha correta no buffer original', () => {
    const result = parseDbml(DBML_WITH_STRIPPED);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('dim_ccontrato');
    const src = DBML_WITH_STRIPPED.split('\n');
    expect(src[result.errorLine!]).toContain('dim_ccontrato');
    expect(src[result.errorLine!]).not.toContain('dim_cbo');
  });

  it('tableAtLine encontra bloco Table na linha do cursor', () => {
    const dbml = `Table a.x {
  id bigint
}

Table b.y {
  nome string
}
`;
    expect(tableAtLine(dbml, 0)).toBe('a.x');
    expect(tableAtLine(dbml, 1)).toBe('a.x');
    expect(tableAtLine(dbml, 4)).toBe('b.y');
  });

  it('resolveTableId casa schema.tabela', () => {
    expect(resolveTableId('silver.dim_cbo', ['silver.dim_cbo', 'silver.dim_cnes'])).toBe('silver.dim_cbo');
  });
});
