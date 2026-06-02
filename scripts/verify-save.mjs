import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let names = ['loja.a', 'loja.b'];
page.on('dialog', (d) => d.accept(names.shift()));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const saveText = () => page.locator('.savestate').innerText();

// Fase 1: backend OK -> Salvo
await page.getByRole('button', { name: '+ Tabela' }).click();
await page.waitForFunction(() => document.querySelector('.savestate')?.textContent?.includes('Salvo'), { timeout: 5000 });
const okState = await saveText();
const onDisk = readFileSync('data/project.dbml', 'utf8').includes('loja.a');

// Fase 2: simula backend indisponível (PUT /api/project -> 500)
await page.route('**/api/project', (route) =>
  route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: 'x' }) : route.continue(),
);
await page.getByRole('button', { name: '+ Tabela' }).click();
await page.waitForFunction(() => document.querySelector('.savestate')?.textContent?.includes('Falha'), { timeout: 5000 }).catch(() => {});
const errState = await saveText();

console.log('Fase 1 indicador:', okState, '| persistiu em disco:', onDisk);
console.log('Fase 2 indicador (backend down):', errState);
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
const ok = okState.includes('Salvo') && onDisk && errState.includes('Falha') && errors.length === 0;
console.log(ok ? '\n✅ SAVE INDICATOR OK' : '\n❌ FALHOU');
process.exit(ok ? 0 : 1);
