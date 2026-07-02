import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node', { timeout: 15000 });
await page.waitForTimeout(600);

const t = page.locator('.table-node').filter({ hasText: 'dim_customer' }).first();
const header = t.locator('.table-node__header').first();
const bgBefore = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
await t.hover();
await t.locator('.table-node__color').first().click({ force: true });
await page.waitForTimeout(200);
await page.locator('.color-palette__row button').nth(3).click({ force: true }); // #00995d
await page.getByRole("button", { name: "Salvar" }).click({ force: true }); await page.waitForTimeout(1200);
const bgAfter = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
console.log(`header bg: ${bgBefore} -> ${bgAfter}`);

const file = readFileSync('data/projects/default/project.dbml', 'utf8');
const hasBlock = /Colors\s*\{/.test(file);
const line = file.split('\n').find((l) => /gold\.dim_customer:\s*#/.test(l)) ?? '(não achou)';
console.log('bloco Colors no ARQUIVO?', hasBlock, '| linha:', line.trim());
console.log('erros:', errors.length ? errors : 'nenhum');
await browser.close();
