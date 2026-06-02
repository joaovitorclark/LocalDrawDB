// Verifica PNG export e persistência (reload restaura o estado).
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL ?? 'http://localhost:5192/';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const initial = await page.locator('.table-node').count();

// Export PNG (dispara download + grava em data/output/diagram.png)
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Export PNG' }).click(),
]);
const pngName = download.suggestedFilename();
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('PNG'), {
  timeout: 10000,
});
const pngStatus = await page.locator('.status').innerText();

// Aguarda autosave e recarrega para testar persistência.
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const afterReload = await page.locator('.table-node').count();

console.log('tabelas iniciais:', initial);
console.log('download PNG:', pngName);
console.log('status PNG:', pngStatus);
console.log('tabelas após reload (persistência):', afterReload);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();

const ok =
  pngName.endsWith('.png') &&
  pngStatus.includes('PNG') &&
  afterReload === initial &&
  initial >= 2 &&
  errors.length === 0;
console.log(ok ? '\n✅ FINAL OK' : '\n❌ FINAL FALHOU');
process.exit(ok ? 0 : 1);
