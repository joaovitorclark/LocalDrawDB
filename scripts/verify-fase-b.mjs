// Fase B: paleta Unimed, crow's foot e hover-highlight.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node', { timeout: 15000 });

// Paleta: header navy + botão Organize verde
const headerBg = await page
  .locator('.table-node__header')
  .first()
  .evaluate((el) => getComputedStyle(el).backgroundColor);
const primaryBg = await page
  .locator('button.btn-primary')
  .evaluate((el) => getComputedStyle(el).backgroundColor);

// Crow's foot: arestas referenciam os marcadores
const markerAttrs = await page
  .locator('.react-flow__edge path')
  .first()
  .evaluate((el) => ({
    start: el.getAttribute('marker-start'),
    end: el.getAttribute('marker-end'),
  }));

// Hover-highlight (Fase 2: CSS no wrapper, sem node--dimmed)
await page.locator('.react-flow__node-table').first().hover();
await page.waitForTimeout(250);
const highlighted = await page.locator('.react-flow__edge.edge--highlight').count();
const focusWrap = await page.locator('.canvas-wrap--focus').count();
const dimmedCount = await page
  .locator('.canvas-wrap--focus .react-flow__node-table')
  .evaluateAll((nodes) => nodes.filter((el) => getComputedStyle(el).opacity === '0.35').length)
  .catch(() => 0);

console.log('header bg (navy ~rgb(19,40,75)):', headerBg);
console.log('primary bg (verde ~rgb(0,153,93)):', primaryBg);
console.log('markers:', markerAttrs);
console.log('arestas destacadas no hover:', highlighted, '| wrapper focus:', focusWrap, '| nós esmaecidos:', dimmedCount);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();
const ok =
  headerBg === 'rgb(19, 40, 75)' &&
  primaryBg === 'rgb(0, 153, 93)' &&
  /cf-(many|one)/.test(markerAttrs.start ?? '') &&
  /cf-(many|one)/.test(markerAttrs.end ?? '') &&
  highlighted >= 1 &&
  focusWrap >= 1 &&
  dimmedCount >= 1 &&
  errors.length === 0;
console.log(ok ? '\n✅ FASE B OK' : '\n❌ FASE B FALHOU');
process.exit(ok ? 0 : 1);
