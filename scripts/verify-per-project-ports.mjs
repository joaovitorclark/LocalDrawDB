// F3 — verifica no navegador que, com o servidor FIXADO num projeto
// (LOCALDRAWDB_PROJECT), a UI mostra o rótulo 📌 e esconde o seletor de troca.
// Assume um servidor de produção já rodando em PORT, fixado num projeto.
// (Ver memória headless-verify-system-chrome.)
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? 5193;
const BASE = `http://localhost:${PORT}`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.toolbar', { timeout: 15000 });
// Dá tempo do getMeta() resolver e o switcher decidir o modo.
await page.waitForSelector('.project-switcher--pinned, .project-switcher__trigger', { timeout: 10000 });

const pinnedCount = await page.locator('.project-switcher--pinned').count();
const pinnedText = pinnedCount
  ? (await page.locator('.project-switcher--pinned').first().innerText()).trim()
  : '';
const triggerCount = await page.locator('.project-switcher__trigger').count();

await browser.close();

console.log('rótulo fixado (.project-switcher--pinned):', pinnedCount, '| texto:', JSON.stringify(pinnedText));
console.log('trigger de troca (.project-switcher__trigger, deve ser 0):', triggerCount);
console.log('erros de console/página:', errors.length ? errors : 'nenhum');

const ok = pinnedCount === 1 && pinnedText.length > 0 && triggerCount === 0 && errors.length === 0;
console.log(ok ? '\n✅ F3 OK — UI fixada' : '\n❌ F3 FALHOU');
process.exit(ok ? 0 : 1);
