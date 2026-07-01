import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node', { timeout: 15000 });
await page.waitForTimeout(600);

// foca silver.fct_sales_wide via a busca de tabelas (clica no item da lista -> pan)
const search = page.getByPlaceholder('Buscar tabela…');
await search.fill('fct_sales_wide');
await page.waitForTimeout(300);
// clica no item da lista de tabelas que casa
const item = page.locator('.layers-panel button, .layers-panel li, .layers-panel [role=button]').filter({ hasText: 'fct_sales_wide' }).first();
if (await item.count()) { await item.click({ force: true }); await page.waitForTimeout(600); }

const t = page.locator('.table-node').filter({ hasText: 'fct_sales_wide' }).first();
if (await t.count()) {
  await t.locator('.table-node__header').first().click({ force: true });
  await page.waitForTimeout(400);
}
const rows = await page.locator('.records-constraints__row').allInnerTexts();
console.log('silver.fct_sales_wide constraints:');
rows.forEach((r) => console.log('   ' + r.replace(/\s+/g, ' ').trim()));
if (!rows.length) console.log('   (não capturado — tabela pode não ter focado)');
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
