import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__edge');
const editor = () => page.locator('.cm-content').innerText();
// clicar na aresta para selecionar
await page.locator('.react-flow__edge').first().click();
await page.waitForTimeout(150);
const selected = await page.locator('.react-flow__edge.selected').count();
// Delete
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
const removed = !(await editor()).includes('Ref:');
console.log('aresta selecionada:', selected, '| removida via Delete:', removed);
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
process.exit(selected >= 1 && removed && errors.length === 0 ? 0 : 1);
