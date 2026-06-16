import { describe, expect, it } from 'vitest';
import { parseDbml } from '../parse';

function syntheticLakehouseDbml(tableCount: number): string {
  const lines: string[] = ['TableGroup ingestao_erp {'];
  for (let i = 0; i < tableCount; i++) {
    lines.push(`  raw.t_${i}`);
  }
  lines.push('}', '');
  for (let i = 0; i < tableCount; i++) {
    lines.push(`Table raw.t_${i} {`);
    lines.push('  id bigint [pk]');
    lines.push('  val string');
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

describe('parseDbml em diagrama sintético grande', () => {
  it('parse de 500 tabelas genéricas completa em menos de 3s', () => {
    const dbml = syntheticLakehouseDbml(500);
    const t0 = performance.now();
    const result = parseDbml(dbml);
    const elapsed = performance.now() - t0;
    expect(result.error).toBeUndefined();
    expect(result.tables).toHaveLength(500);
    expect(elapsed).toBeLessThan(3000);
  });

  it('parse de 1000 tabelas genéricas completa em menos de 3s', () => {
    const dbml = syntheticLakehouseDbml(1000);
    const t0 = performance.now();
    const result = parseDbml(dbml);
    const elapsed = performance.now() - t0;
    expect(result.error).toBeUndefined();
    expect(result.tables).toHaveLength(1000);
    expect(elapsed).toBeLessThan(3000);
  });
});
