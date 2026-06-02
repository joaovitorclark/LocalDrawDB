import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__edge');
const editor = () => page.locator('.cm-content').innerText();

// revela os updaters: hover na aresta
const edge = page.locator('.react-flow__edge').first();
await edge.hover();
await page.waitForTimeout(200);
const updaterCount = await page.locator('.react-flow__edgeupdater').count();
const updTarget = page.locator('.react-flow__edgeupdater-target').first();
const ub = await updTarget.boundingBox().catch(() => null);
const opHandle = page.locator('.react-flow__node[data-id="loja.a"] [data-handleid="t:operation_type"]');
const ob = await opHandle.boundingBox();

let reconnected = false;
if (ub && ob) {
  await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2);
  await page.mouse.down();
  await page.mouse.move(ob.x + ob.width / 2, ob.y + ob.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const t = await editor();
  reconnected = t.includes('loja.a.operation_type') && !t.includes('loja.a.ingestion_timestamp');
}
console.log('updaters encontrados:', updaterCount, '| updater bbox:', !!ub, '| op handle bbox:', !!ob);
console.log('reconnect aplicou (operation_type, sem ingestion):', reconnected);
console.log('editor refs:', (await editor()).split('\n').filter((l) => l.startsWith('Ref')));
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
process.exit(reconnected && errors.length === 0 ? 0 : 1);
