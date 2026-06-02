// Fase A: o exemplo do dbdiagram (com Records) não quebra o canvas, mostra a amostra,
// e o botão Organize reordena tables -> refs -> records.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node', { timeout: 15000 });

const tables = await page.locator('.table-node__header').allInnerTexts();
const recordsPanel = await page.locator('.records-panel').count();
const recordRows = await page.locator('.records-table tbody tr').count();

// Organize
await page.getByRole('button', { name: 'Organize' }).click();
await page.waitForTimeout(400);
const editorText = await page.locator('.cm-content').innerText();
const idxTable = editorText.indexOf('Table');
const idxRef = editorText.indexOf('Ref ');
const idxRec = editorText.indexOf('Records');

console.log('tabelas:', tables);
console.log('records-panel presente:', recordsPanel, '| linhas de amostra:', recordRows);
console.log('ordem pós-Organize (Table<Ref<Records):', idxTable, idxRef, idxRec);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();
const ok =
  tables.length === 3 &&
  recordsPanel === 1 &&
  recordRows >= 2 &&
  idxTable >= 0 &&
  idxTable < idxRef &&
  idxRef < idxRec &&
  errors.length === 0;
console.log(ok ? '\n✅ FASE A OK' : '\n❌ FASE A FALHOU');
process.exit(ok ? 0 : 1);
