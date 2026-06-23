import { describe, expect, it } from 'vitest';
import { allocateDevPorts } from '../devPorts.mjs';

describe('allocateDevPorts', () => {
  it('com exclude acumulado, aloca portas distintas entre instâncias', async () => {
    const used = new Set<number>();
    const a = await allocateDevPorts(process.env, used);
    used.add(a.apiPort);
    used.add(a.webPort);
    const b = await allocateDevPorts(process.env, used);
    expect(b.apiPort).not.toBe(a.apiPort);
    expect(b.webPort).not.toBe(a.webPort);
    expect(b.apiPort).not.toBe(a.webPort);
    expect(b.webPort).not.toBe(a.apiPort);
  });
});
