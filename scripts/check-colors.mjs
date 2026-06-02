import { chromium } from 'playwright-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
await page.locator('.table-node__header').first().locator('.table-node__color').click();
await page.locator('.color-palette button').nth(1).click();
await page.waitForTimeout(1300); // deixa o autosave disparar
await browser.close();
console.log('cor escolhida + autosave aguardado');
