// Verificação das 5 features v4.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
await page.waitForTimeout(500);
const tcount = () => page.locator('.table-node').count();
const editor = () => page.locator('.cm-content').innerText();
const ok = {};

// F4 — scroll
ok.scroll = await page.locator('.cm-scroller').first().evaluate((el) => getComputedStyle(el).overflow !== 'visible');

// F2 — cor por camada (mart = ouro #d4af37 = rgb(212,175,55)) + painel presente
ok.panel = (await page.locator('.layers-panel').count()) === 1;
ok.layerColor = (await page.locator('.react-flow__node[data-id="mart.dim_cliente"] .table-node__header')
  .evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(212, 175, 55)';

// F5 — ⓘ + popover na mart
const info = page.locator('.react-flow__node[data-id="mart.dim_cliente"] .table-node__info');
ok.infoIcon = (await info.count()) === 1;
await info.hover();
await page.waitForTimeout(150);
ok.infoPopover = (await page.locator('.info-popover').count()) >= 1;
await page.mouse.move(10, 10);

// F3 — linhagem: 1 label inicial; toggle esconde; recria
const lineLabels = () => page.locator('.lineage-label').count();
ok.lineageInit = (await lineLabels()) === 1;
await page.locator('.layers-panel__row', { hasText: 'Mostrar linhagem' }).locator('input').uncheck();
await page.waitForTimeout(150);
ok.lineageHidden = (await lineLabels()) === 0;
await page.locator('.layers-panel__row', { hasText: 'Mostrar linhagem' }).locator('input').check();
await page.waitForTimeout(150);

// F3 — criar linhagem por arraste (modo linhagem) stg.orders -> mart.dim_cliente
await page.locator('.layers-panel__row', { hasText: 'Modo linhagem' }).locator('input').check();
await page.locator('.react-flow__node[data-id="stg.orders"]').hover();
const src = page.locator('.react-flow__node[data-id="stg.orders"] [data-handleid="s:customer_id"]');
const tgt = page.locator('.react-flow__node[data-id="mart.dim_cliente"] [data-handleid="t:id"]');
const sb = await src.boundingBox();
const tb = await tgt.boundingBox();
const refsBefore = ((await editor()).match(/\nRef:/g) || []).length;
if (sb && tb) {
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
ok.lineageCreated = (await lineLabels()) === 2;
ok.dbmlUnchanged = ((await editor()).match(/\nRef:/g) || []).length === refsBefore; // não criou Ref
await page.locator('.layers-panel__row', { hasText: 'Modo linhagem' }).locator('input').uncheck();

// F1 — colapsar grupo mart_grp esconde a tabela membro
const before = await tcount();
await page.locator('.group-node__label', { hasText: 'mart_grp' }).locator('.group-node__toggle').click();
await page.waitForTimeout(250);
ok.groupCollapse = (await tcount()) === before - 1;

// F2 — esconder camada bronze (modo esconder): some raw.orders
await page.locator('.layers-panel__row', { hasText: 'Esmaecer' }).locator('input').uncheck();
const before2 = await tcount();
await page.locator('.layers-panel__row', { hasText: 'Bronze' }).locator('input').uncheck();
await page.waitForTimeout(250);
ok.layerHide = (await tcount()) === before2 - 1;

console.log(JSON.stringify(ok, null, 1));
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
const pass = Object.values(ok).every(Boolean) && errors.length === 0;
console.log(pass ? '\n✅ V4 OK' : '\n❌ V4 FALHOU');
process.exit(pass ? 0 : 1);
