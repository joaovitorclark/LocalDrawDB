import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.pane--editor', { timeout: 15000 });
await page.waitForTimeout(500);

const w0 = (await page.locator('.pane--editor').boundingBox()).width;
const rez = page.locator('.pane-resizer');
console.log('resizer presente?', await rez.count());
const box = await rez.boundingBox();
// arrasta o splitter ~200px pra direita (aumenta o editor)
await page.mouse.move(box.x + 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 202, box.y + box.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const w1 = (await page.locator('.pane--editor').boundingBox()).width;
const saved = await page.evaluate(() => localStorage.getItem('ldb.editorWidth'));
console.log(`largura editor: ${Math.round(w0)} -> ${Math.round(w1)} (delta ${Math.round(w1 - w0)})`);
console.log('persistido no localStorage:', saved);

// recarrega e confirma que a largura foi restaurada
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.pane--editor');
await page.waitForTimeout(400);
const w2 = (await page.locator('.pane--editor').boundingBox()).width;
console.log(`após reload: ${Math.round(w2)} (deve ~= ${Math.round(w1)})`);
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
