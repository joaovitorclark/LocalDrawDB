import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const before = await page.locator('.table-node').count();

// Digita uma tabela inválida (hífen) no fim do editor.
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.type('\n\nTable Fato-pedidos {\n  id bigint [pk]\n}');
await page.waitForSelector('.editor__error', { timeout: 5000 });
const errText = await page.locator('.editor__error').innerText();
const afterError = await page.locator('.table-node').count();

console.log('tabelas antes:', before);
console.log('mensagem de erro:', JSON.stringify(errText));
console.log('tabelas durante erro (deve manter):', afterError);
console.log('[object Object]?', errText.includes('[object'));
await browser.close();
const ok = !errText.includes('[object') && errText.toLowerCase().includes('linha') && afterError === before && before >= 2 && errors.length === 0;
console.log(ok ? '\n✅ ERRO TRATADO OK' : '\n❌ FALHOU');
process.exit(ok ? 0 : 1);
