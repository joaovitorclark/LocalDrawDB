// F4 — verifica no navegador que os metadados dbt aparecem na UI:
//  - TableInfoPopover: badges resource_type / materialization / tags
//  - ColumnPanel: seção "Tests dbt" com accepted_values
//  - LayersPanel: seletor "inserir preset" com os presets de camada
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? 5192;
const BASE = `http://localhost:${PORT}`;

const DBML = `Table gold.fatos {
  id bigint [pk]
  status string
  valor decimal(18,2)
}

Table bronze.raw_fatos {
  id bigint [pk]
}

Dbt {
  table gold.fatos {
    resource_type: model
    materialization: incremental
    tags: ['core', 'gold']
    columns {
      status {
        accepted_values: ['ativo', 'cancelado']
      }
    }
  }
  table bronze.raw_fatos {
    resource_type: source
  }
}
`;

// Semeia o DBML no projeto ativo antes de carregar a página.
const put = await fetch(`${BASE}/api/project`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ dbml: DBML, canvas: {} }),
});
if (!put.ok) {
  console.error('falha ao semear DBML:', put.status);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.table-node', { timeout: 15000 });

// 1. Popover de metadados dbt na tabela gold.fatos
const goldNode = page.locator('.react-flow__node-table', { hasText: 'gold.' });
await goldNode.locator('.table-node__info').first().hover();
await page.waitForSelector('.dbt-badge', { timeout: 5000 });
const badges = (await page.locator('.dbt-badge').allInnerTexts()).map((s) => s.trim());

// 2. ColumnPanel — tests da coluna status
await goldNode.locator('.col-row', { hasText: 'status' }).first().click();
await page.waitForSelector('.column-panel__tests', { timeout: 5000 });
const colTests = (await page.locator('.column-panel__tests li').allInnerTexts()).map((s) => s.trim());

// 3. LayersPanel — seletor de preset
const presetOpts = await page.locator('.layers-panel__preset option').allInnerTexts();

await browser.close();

console.log('badges dbt:', badges);
console.log('tests da coluna status:', colTests);
console.log('opções de preset:', presetOpts);
console.log('erros:', errors.length ? errors : 'nenhum');

const ok =
  badges.includes('model') &&
  badges.includes('incremental') &&
  badges.some((b) => b.includes('core')) &&
  colTests.some((t) => t.includes('accepted_values') && t.includes('ativo')) &&
  presetOpts.some((o) => /Medallion/i.test(o)) &&
  presetOpts.length >= 6 &&
  errors.length === 0;

console.log(ok ? '\n✅ F4 OK' : '\n❌ F4 FALHOU');
process.exit(ok ? 0 : 1);
