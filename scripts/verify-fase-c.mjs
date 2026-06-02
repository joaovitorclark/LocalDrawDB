// Fase C: cor por tabela, painel de coluna, rename inline e drag-to-create.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const editor = () => page.locator('.cm-content').innerText();

// --- 1) Cor por tabela ---
const firstHeader = page.locator('.table-node__header').first();
await firstHeader.locator('.table-node__color').click();
await page.locator('.color-palette button').nth(1).click(); // verde
await page.waitForTimeout(150);
const headerBg = await firstHeader.evaluate((el) => getComputedStyle(el).backgroundColor);

// --- 2) Painel de propriedades da coluna (Not null) ---
await page.locator('.react-flow__node[data-id="loja.cliente"] .col-row', { hasText: 'nome' }).first().click();
await page.waitForSelector('.column-panel');
await page.locator('.column-panel__row', { hasText: 'Not null' }).locator('input').check();
await page.waitForTimeout(200);
const hasNotNull = (await editor()).includes('nome string [not null]');

// --- 3) Rename inline ---
const cidName = page
  .locator('.react-flow__node[data-id="loja.pedido"] .col-row', { hasText: 'cliente_id' })
  .locator('.col-name');
await cidName.dblclick();
await page.locator('.col-edit').fill('cliente_ref');
await page.locator('.col-edit').press('Enter');
await page.waitForTimeout(200);
const renamed = (await editor()).includes('cliente_ref');

// --- 4) Drag-to-create ---
await page.locator('.react-flow__node[data-id="loja.pedido"]').hover();
const src = page.locator('.react-flow__node[data-id="loja.pedido"] [data-handleid="s:cliente_ref"]');
const tgt = page.locator('.react-flow__node[data-id="loja.cliente"] [data-handleid="t:id"]');
const sb = await src.boundingBox();
const tb = await tgt.boundingBox();
let dragged = false;
if (sb && tb) {
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  dragged = (await editor()).includes('Ref:');
}

console.log('1) header verde:', headerBg);
console.log('2) coluna not null aplicado:', hasNotNull);
console.log('3) rename inline aplicado:', renamed);
console.log('4) drag-to-create criou Ref:', dragged, '| handles achados:', !!sb, !!tb);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();
const ok = headerBg === 'rgb(0, 153, 93)' && hasNotNull && renamed && dragged && errors.length === 0;
console.log(ok ? '\n✅ FASE C OK' : '\n❌ FASE C FALHOU');
process.exit(ok ? 0 : 1);
