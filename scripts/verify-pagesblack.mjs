import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0,160)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0,160)));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node', { timeout: 15000 });
await page.waitForTimeout(700);
const collapse = page.locator('.pages-panel__collapse');
if (await collapse.count()) { await collapse.click({ force:true }); await page.waitForTimeout(300); }
const rows = page.locator('.pages-panel__row');
await rows.filter({ hasText: 'Todas' }).locator('input').click({ force:true });
await page.waitForTimeout(300);
await rows.filter({ hasText: 'dimensoes' }).locator('input').click({ force:true });
await page.waitForTimeout(700);
const appOk = await page.locator('.app').count();
const nodes = await page.locator('.react-flow__node-table').count();
console.log('após filtrar dimensoes -> .app existe:', appOk, '| nós tabela:', nodes, '| crashou?', appOk===0);
console.log('erros:', errors.length ? errors : 'nenhum');
// testa outros grupos também
for (const g of ['fatos_largos','ingestao_source1']) {
  await rows.filter({ hasText: g }).locator('input').click({ force:true });
  await page.waitForTimeout(400);
}
console.log('após +2 grupos -> .app existe:', await page.locator('.app').count(), '| erros totais:', errors.length);
await browser.close();
