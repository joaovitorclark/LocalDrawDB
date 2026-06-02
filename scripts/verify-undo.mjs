// Stretch: undo/redo global (botões + atalho), incluindo ações do canvas.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept('loja.novo')); // + Tabela

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node');
const editor = () => page.locator('.cm-content').innerText();
const undoBtn = page.getByRole('button', { name: '↶' });
const redoBtn = page.getByRole('button', { name: '↷' });

const undoDisabledInicial = await undoBtn.isDisabled();

// Ação discreta: adicionar tabela
await page.getByRole('button', { name: '+ Tabela' }).click();
await page.waitForTimeout(600); // deixa o commit do histórico ocorrer
const afterAdd = (await editor()).includes('loja.novo');
const undoEnabled = !(await undoBtn.isDisabled());

// Undo (botão)
await undoBtn.click();
await page.waitForTimeout(250);
const afterUndo = (await editor()).includes('loja.novo');

// Redo (botão)
await redoBtn.click();
await page.waitForTimeout(250);
const afterRedo = (await editor()).includes('loja.novo');

// Undo via teclado (Ctrl+Z), mesmo com foco no editor
await page.locator('.cm-content').click();
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
const afterKbUndo = (await editor()).includes('loja.novo');

console.log('undo desabilitado no início:', undoDisabledInicial);
console.log('add ->', afterAdd, '| undo habilitou:', undoEnabled);
console.log('após undo (sem loja.novo):', !afterUndo);
console.log('após redo (com loja.novo):', afterRedo);
console.log('após undo via teclado (sem loja.novo):', !afterKbUndo);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();
const ok =
  undoDisabledInicial &&
  afterAdd &&
  undoEnabled &&
  !afterUndo &&
  afterRedo &&
  !afterKbUndo &&
  errors.length === 0;
console.log(ok ? '\n✅ UNDO/REDO OK' : '\n❌ UNDO/REDO FALHOU');
process.exit(ok ? 0 : 1);
