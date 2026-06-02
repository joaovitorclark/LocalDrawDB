// Verificação headless: carrega o app servido e confere que editor + canvas renderizam.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL ?? 'http://localhost:5192/';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });

// Espera o canvas e os nós de tabela aparecerem (a partir do DBML de exemplo).
await page.waitForSelector('.react-flow', { timeout: 15000 });
await page.waitForSelector('.table-node', { timeout: 15000 });

const tableCount = await page.locator('.table-node').count();
const headers = await page.locator('.table-node__header').allInnerTexts();
const edgeCount = await page.locator('.react-flow__edge').count();
const hasEditor = (await page.locator('.cm-editor').count()) > 0;
const buttons = await page.locator('.toolbar button').allInnerTexts();

console.log('editor presente:', hasEditor);
console.log('tabelas renderizadas:', tableCount, headers);
console.log('arestas (refs):', edgeCount);
console.log('botões:', buttons.join(' | '));
console.log('erros de console:', errors.length ? errors : 'nenhum');

await browser.close();

const ok = hasEditor && tableCount >= 2 && edgeCount >= 1 && errors.length === 0;
console.log(ok ? '\n✅ RENDER OK' : '\n❌ RENDER FALHOU');
process.exit(ok ? 0 : 1);
