// E2E pela UI: importa de data/input/, exporta DDL/dbt/erwin e confere o status.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL ?? 'http://localhost:5192/';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const before = await page.locator('.table-node').count();

// Importar de data/input/
await page.getByRole('button', { name: 'Importar (input/)' }).click();
await page.waitForFunction(
  () => document.querySelector('.status')?.textContent?.startsWith('Importado'),
  { timeout: 10000 },
);
await page.waitForTimeout(500);
const after = await page.locator('.table-node').count();
const importStatus = await page.locator('.status').innerText();

// Exportações
async function clickAndStatus(name) {
  await page.getByRole('button', { name }).click();
  await page.waitForFunction(
    () => document.querySelector('.status')?.textContent?.startsWith('Gerado'),
    { timeout: 10000 },
  );
  return page.locator('.status').innerText();
}
const ddl = await clickAndStatus('Export DDL');
const dbt = await clickAndStatus('Export dbt');
const erwin = await clickAndStatus('Export erwin');

console.log('tabelas antes/depois do import:', before, '->', after);
console.log('status import:', importStatus);
console.log('ddl:', ddl);
console.log('dbt:', dbt);
console.log('erwin:', erwin);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();

const ok =
  after > before &&
  importStatus.includes('canal_venda') &&
  ddl.includes('Gerado') &&
  dbt.includes('dbt') &&
  erwin.includes('erwin') &&
  errors.length === 0;
console.log(ok ? '\n✅ E2E OK' : '\n❌ E2E FALHOU');
process.exit(ok ? 0 : 1);
