import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 760 } });
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__edge');
await page.locator('.react-flow__edge').first().click(); // seleciona p/ mostrar ✕
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/ldd-v3.png' });
await browser.close();
console.log('shot saved');
