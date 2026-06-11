// E2E pela UI: importa de data/input/, exporta formatos e confere o status.
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

await page.getByRole('button', { name: 'Importar (input/)' }).click();
await page.waitForFunction(
  () => document.querySelector('.status')?.textContent?.startsWith('Importado'),
  { timeout: 10000 },
);
await page.waitForTimeout(500);
const after = await page.locator('.table-node').count();
const importStatus = await page.locator('.status').innerText();

async function exportWithFormat(optionLabel) {
  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('menuitem', { name: optionLabel }).click();
  await page.waitForFunction(
    () => document.querySelector('.status')?.textContent?.startsWith('Gerado'),
    { timeout: 10000 },
  );
  return page.locator('.status').innerText();
}

const sparkDdl = await exportWithFormat('Spark DDL');
const dbt = await exportWithFormat('dbt');
const erwin = await exportWithFormat('erwin (ANSI)');

console.log('tabelas antes/depois do import:', before, '->', after);
console.log('status import:', importStatus);
console.log('spark ddl:', sparkDdl);
console.log('dbt:', dbt);
console.log('erwin:', erwin);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();

const ok =
  after > before &&
  importStatus.includes('canal_venda') &&
  sparkDdl.includes('Gerado') &&
  dbt.includes('dbt') &&
  erwin.includes('erwin') &&
  errors.length === 0;
console.log(ok ? '\n✅ E2E OK' : '\n❌ E2E FALHOU');
process.exit(ok ? 0 : 1);
