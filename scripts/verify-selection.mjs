// Mede consistência da seleção de tabela (#7): clica o header N vezes, reporta acertos.
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

async function selectedIds() {
  return (await page.locator('.react-flow__node.selected .table-node__header').allInnerTexts())
    .map((h) => h.split('\n')[0]);
}
async function clearSel() {
  await page.mouse.click(1000, 130);
  await page.waitForTimeout(150);
}

// alterna entre duas tabelas e clica o header de cada, várias vezes
const names = ['dim_currency', 'dim_customer'];
let ok = 0, total = 0;
for (let round = 0; round < 6; round++) {
  const name = names[round % 2];
  await clearSel();
  const t = page.locator('.table-node').filter({ hasText: name }).first();
  await t.locator('.table-node__header').first().click({ force: true });
  await page.waitForTimeout(250);
  const sel = await selectedIds();
  const hit = sel.length === 1 && sel[0].includes(name);
  total++; if (hit) ok++;
  console.log(`round ${round} clicar ${name} -> selecionados=[${sel.join(',')}] ${hit ? 'OK' : 'FALHOU'}`);
}
console.log(`\nconsistência: ${ok}/${total}`);
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
