// v3: aresta na coluna certa, sem snap-back, deletar e reconectar relação.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__edge');
const editor = () => page.locator('.cm-content').innerText();
const centerY = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return b ? b.y + b.height / 2 : null;
};

// 1) Coluna certa: o fim da aresta fica na linha ingestion_timestamp, não no id.
const ingY = await centerY('.react-flow__node[data-id="loja.a"] [data-handleid="t:ingestion_timestamp"]');
const idY = await centerY('.react-flow__node[data-id="loja.a"] [data-handleid="t:id"]');
const pathBox = await page.locator('.react-flow__edge path').first().boundingBox();
const endY = pathBox.y + pathBox.height; // ponto-alvo (lado a, mais baixo)
const colCerta = Math.abs(endY - ingY) < Math.abs(endY - idY);

// 2) Sem snap-back: arrastar loja.a, depois hover + editar; posição permanece.
const aNode = page.locator('.react-flow__node[data-id="loja.a"]');
const tf = () => aNode.evaluate((el) => el.style.transform);
const before = await tf();
const hb = await aNode.locator('.table-node__header').boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 160, hb.y + hb.height / 2 + 120, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(200);
const afterDrag = await tf();
// hover noutro nó + edição de texto
await page.locator('.react-flow__node[data-id="loja.cliente"]').hover();
await page.locator('.cm-content').click();
await page.keyboard.type('\n// nota');
await page.waitForTimeout(300);
const afterHoverEdit = await tf();
const semSnapBack = afterDrag !== before && afterHoverEdit === afterDrag;
await page.waitForTimeout(1100); // autosave
const canvas = JSON.parse(readFileSync('data/canvas.json', 'utf8'));
const persistiu = !!canvas.positions?.['loja.a'];

// 3) Deletar via botão ✕: selecionar aresta -> ✕ -> Ref some
await page.locator('.react-flow__edge').first().click();
await page.waitForSelector('.edge-delete', { timeout: 4000 });
await page.locator('.edge-delete').click();
await page.waitForTimeout(300);
const deletou = !(await editor()).includes('loja.cliente.id > loja.a.ingestion_timestamp');

console.log('1) coluna certa:', colCerta, `(endY=${endY?.toFixed(0)} ing=${ingY?.toFixed(0)} id=${idY?.toFixed(0)})`);
console.log('2) sem snap-back:', semSnapBack, '| posição persistida:', persistiu);
console.log('3) deletou via ✕:', deletou);
console.log('erros:', errors.length ? errors : 'nenhum');

await browser.close();
const ok = colCerta && semSnapBack && persistiu && deletou && errors.length === 0;
console.log(ok ? '\n✅ CANVAS v3 (1-3) OK' : '\n❌ FALHOU');
process.exit(ok ? 0 : 1);
