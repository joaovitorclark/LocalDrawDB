// Stretch: export Mermaid e renomear tabela inline (atualiza refs).
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// O renomear usa prompt(): respondemos com o novo nome.
page.on('dialog', (d) => d.accept('loja.consumidor'));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const editor = () => page.locator('.cm-content').innerText();

// 1) Export Mermaid
await page.getByRole('button', { name: 'Export Mermaid' }).click();
await page.waitForFunction(
  () => document.querySelector('.status')?.textContent?.startsWith('Gerado'),
  { timeout: 10000 },
);
const mermaidStatus = await page.locator('.status').innerText();

// 2) Renomear tabela (duplo-clique no título de loja.cliente)
await page
  .locator('.react-flow__node[data-id="loja.cliente"] .table-node__title')
  .dblclick();
await page.waitForTimeout(300);
const txt = await editor();
const renamedHeader = txt.includes('Table loja.consumidor');
const renamedRef = txt.includes('loja.consumidor.id');

console.log('1) status mermaid:', mermaidStatus);
console.log('2) header renomeado:', renamedHeader, '| ref atualizada:', renamedRef);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();
const ok =
  mermaidStatus.includes('mermaid') && renamedHeader && renamedRef && errors.length === 0;
console.log(ok ? '\n✅ STRETCH OK' : '\n❌ STRETCH FALHOU');
process.exit(ok ? 0 : 1);
