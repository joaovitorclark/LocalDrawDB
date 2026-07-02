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

// foca fct_sales_wide via busca (isola/centraliza)
await page.getByPlaceholder('Buscar tabela…').fill('fct_sales_wide');
await page.waitForTimeout(200);
const item = page.locator('.layers-panel button, .layers-panel li, .layers-panel [role=button]').filter({ hasText: 'fct_sales_wide' }).first();
if (await item.count()) { await item.click({ force: true }); await page.waitForTimeout(700); }
await page.mouse.click(1000, 130); await page.waitForTimeout(150); // limpa seleção

const t = page.locator('.table-node').filter({ hasText: 'fct_sales_wide' }).first();
await t.locator('.col-row').nth(2).click({ force: true }); // clica uma COLUNA
await page.waitForTimeout(300);
const selNode = (await page.locator('.react-flow__node.selected .table-node__header').allInnerTexts()).map(h=>h.split('\n')[0]);
const selCol = await page.locator('.col-row.is-selected .col-name').allInnerTexts();
const dataTitle = await page.locator('.records-table--notes .records-table__title').first().innerText().catch(()=>'(vazio)');
console.log('nó selecionado (tabela):', selNode);
console.log('coluna selecionada:', selCol);
console.log('painel dados:', dataTitle);
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
