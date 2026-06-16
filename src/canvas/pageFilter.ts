import type { CanvasPage } from '../api';
import type { ParseResult, RefView } from '../dsl/parse';
import { ALL_PAGE_ID, UNGROUPED_PAGE_ID } from './scaleLimits';

export const EXTERNAL_STUB_PREFIX = 'external:';
export const EXTERNAL_TARGET_HANDLE = 't:__external__';
export const EXTERNAL_SOURCE_HANDLE = 's:__external__';

export type ExternalGroupStub = {
  id: string;
  groupKey: string;
  label: string;
  tableCount: number;
  linkCount?: number;
};

export type CrossPageRef = RefView & {
  visibleTable: string;
  hiddenTable: string;
  stubId: string;
  /** FK saindo da tabela visível → grupo oculto. */
  direction: 'out' | 'in';
  /** schema.tabela.coluna do lado oculto (rótulo na aresta). */
  remoteLabel: string;
};

export type CanvasViewModel = {
  model: ParseResult;
  stubs: ExternalGroupStub[];
  crossRefs: CrossPageRef[];
};

function tableInPage(t: { id: string; group?: string }, page: CanvasPage): boolean {
  if (page.tableGroups.includes(ALL_PAGE_ID)) return true;
  if (!t.group && page.tableGroups.includes(UNGROUPED_PAGE_ID)) return true;
  return !!t.group && page.tableGroups.includes(t.group);
}

function tableInAnyPage(t: { id: string; group?: string }, pages: CanvasPage[]): boolean {
  return pages.some((p) => tableInPage(t, p));
}

export function tableGroupKey(t: { group?: string }): string {
  return t.group ?? UNGROUPED_PAGE_ID;
}

export type AggregatedCrossLink = {
  id: string;
  visibleTable: string;
  stubId: string;
  stubLabel: string;
  direction: 'out' | 'in';
  count: number;
  refs: CrossPageRef[];
};

export function externalSourceHandle(stubId: string): string {
  return `ext:${stubId}`;
}

export function externalTargetHandle(stubId: string): string {
  return `ext:in:${stubId}`;
}

/** Uma ligação visual por (tabela visível, grupo externo). */
export function aggregateCrossLinks(
  crossRefs: CrossPageRef[],
  stubs: ExternalGroupStub[],
): AggregatedCrossLink[] {
  const labels = new Map(stubs.map((s) => [s.id, s.label] as const));
  const map = new Map<string, AggregatedCrossLink>();
  for (const r of crossRefs) {
    const key = `${r.direction}:${r.visibleTable}:${r.stubId}`;
    let link = map.get(key);
    if (!link) {
      link = {
        id: `xlink:${r.direction}:${r.visibleTable}:${r.stubId}`,
        visibleTable: r.visibleTable,
        stubId: r.stubId,
        stubLabel: labels.get(r.stubId) ?? r.stubId,
        direction: r.direction,
        count: 0,
        refs: [],
      };
      map.set(key, link);
    }
    link.count += 1;
    link.refs.push(r);
  }
  return [...map.values()];
}

export function linkCountByStub(crossRefs: CrossPageRef[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of crossRefs) {
    counts.set(r.stubId, (counts.get(r.stubId) ?? 0) + 1);
  }
  return counts;
}

export function isExternalStubNodeId(id: string): boolean {
  return id.startsWith(EXTERNAL_STUB_PREFIX);
}

export function stubNodeId(groupKey: string): string {
  return `${EXTERNAL_STUB_PREFIX}${groupKey}`;
}

function labelForGroup(groupKey: string, pages: CanvasPage[]): string {
  if (groupKey === UNGROUPED_PAGE_ID) return 'Sem grupo';
  return pages.find((p) => p.id === groupKey)?.name ?? groupKey;
}

/** Filtra modelo para o canvas: união das páginas selecionadas + refs/linhagem internas. */
export function filterParseResultByPages(
  model: ParseResult,
  pages: CanvasPage[],
  selectedIds: string[],
): ParseResult {
  if (!selectedIds.length) {
    return { ...model, tables: [], refs: [], lineage: [], lineageFields: [] };
  }
  if (selectedIds.includes(ALL_PAGE_ID)) return model;

  const selectedPages = pages.filter((p) => selectedIds.includes(p.id));
  if (!selectedPages.length) return model;

  const tables = model.tables.filter((t) => tableInAnyPage(t, selectedPages));
  const ids = new Set(tables.map((t) => t.id));
  const refs = model.refs.filter((r) => ids.has(r.source) && ids.has(r.target));
  const lineage = model.lineage.filter((l) => ids.has(l.target) && l.sources.every((s) => ids.has(s)));
  const lineageFields = (model.lineageFields ?? []).filter(
    (f) => ids.has(f.targetTable) && ids.has(f.sourceTable),
  );
  return { ...model, tables, refs, lineage, lineageFields };
}

/** Modelo visível + stubs/arestas para grupos fora da página ativa. */
export function buildCanvasViewModel(
  model: ParseResult,
  pages: CanvasPage[],
  selectedIds: string[],
): CanvasViewModel {
  const filtered = filterParseResultByPages(model, pages, selectedIds);
  if (!selectedIds.length || selectedIds.includes(ALL_PAGE_ID)) {
    return { model: filtered, stubs: [], crossRefs: [] };
  }

  const visibleIds = new Set(filtered.tables.map((t) => t.id));
  const tableById = new Map(model.tables.map((t) => [t.id, t] as const));
  const stubMap = new Map<string, ExternalGroupStub>();
  const crossRefs: CrossPageRef[] = [];

  for (const r of model.refs) {
    const srcVis = visibleIds.has(r.source);
    const tgtVis = visibleIds.has(r.target);
    if (srcVis === tgtVis) continue;

    const hiddenId = srcVis ? r.target : r.source;
    const hiddenTable = tableById.get(hiddenId);
    if (!hiddenTable) continue;

    const gk = tableGroupKey(hiddenTable);
    const sid = stubNodeId(gk);
    if (!stubMap.has(sid)) {
      const tableCount = model.tables.filter(
        (t) => tableGroupKey(t) === gk && !visibleIds.has(t.id),
      ).length;
      stubMap.set(sid, {
        id: sid,
        groupKey: gk,
        label: labelForGroup(gk, pages),
        tableCount,
      });
    }

    crossRefs.push({
      ...r,
      visibleTable: srcVis ? r.source : r.target,
      hiddenTable: hiddenId,
      stubId: sid,
      direction: srcVis ? 'out' : 'in',
      remoteLabel: srcVis ? `${r.target}.${r.toCol}` : `${r.source}.${r.fromCol}`,
    });
  }

  return { model: filtered, stubs: [...stubMap.values()], crossRefs };
}

/** Enriquece stubs com contagem de ligações visíveis. */
export function stubsWithLinkCounts(stubs: ExternalGroupStub[], crossRefs: CrossPageRef[]): ExternalGroupStub[] {
  const counts = linkCountByStub(crossRefs);
  return stubs.map((s) => ({ ...s, linkCount: counts.get(s.id) ?? 0 }));
}

/** Filtra modelo para uma única página (compat). */
export function filterParseResultByPage(model: ParseResult, page: CanvasPage | null): ParseResult {
  if (!page || page.id === ALL_PAGE_ID || page.tableGroups.includes(ALL_PAGE_ID)) return model;
  return filterParseResultByPages(model, [page], [page.id]);
}

/** Posição default de stub ao lado das tabelas visíveis conectadas. */
export function defaultExternalStubPosition(
  stubId: string,
  crossRefs: CrossPageRef[],
  positions: Record<string, { x: number; y: number }>,
): { x: number; y: number } {
  const related = crossRefs.filter((r) => r.stubId === stubId);
  const visIds = [...new Set(related.map((r) => r.visibleTable))];
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const id of visIds) {
    const p = positions[id];
    if (!p) continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  if (!n) return { x: 520, y: 80 };
  const cx = sx / n;
  const cy = sy / n;
  const outCount = related.filter((r) => r.direction === 'out').length;
  const inCount = related.filter((r) => r.direction === 'in').length;
  const offsetX = outCount >= inCount ? 380 : -300;
  return { x: cx + offsetX, y: cy };
}

const STUB_W = 240;
const STUB_H = 56;
const STUB_GAP = 20;
const STUB_TOP = 24;
/** Espaço entre a fileira de stubs e o conteúdo visível abaixo. */
const STUB_TO_CONTENT = 56;
const TABLE_W_EST = 300;

/** Após autolayout: fileira de stubs no topo, conteúdo deslocado para baixo. */
export function layoutExternalStubsOnTop(
  tablePositions: Record<string, { x: number; y: number }>,
  stubs: ExternalGroupStub[],
): Record<string, { x: number; y: number }> {
  if (!stubs.length) return tablePositions;

  const tableIds = Object.keys(tablePositions).filter((id) => !isExternalStubNodeId(id));
  const sortedStubs = [...stubs].sort((a, b) => a.label.localeCompare(b.label));
  const rowWidth = sortedStubs.length * STUB_W + Math.max(0, sortedStubs.length - 1) * STUB_GAP;

  if (!tableIds.length) {
    const out = { ...tablePositions };
    let x = STUB_TOP;
    for (const stub of sortedStubs) {
      out[stub.id] = { x, y: STUB_TOP };
      x += STUB_W + STUB_GAP;
    }
    return out;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const id of tableIds) {
    const p = tablePositions[id];
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + TABLE_W_EST);
  }

  const targetContentTop = STUB_TOP + STUB_H + STUB_TO_CONTENT;
  const shiftY = targetContentTop - minY;
  const out: Record<string, { x: number; y: number }> = {};
  for (const id of tableIds) {
    const p = tablePositions[id];
    out[id] = { x: p.x, y: p.y + shiftY };
  }

  const centerX = (minX + maxX) / 2;
  let startX = centerX - rowWidth / 2;
  for (let i = 0; i < sortedStubs.length; i++) {
    out[sortedStubs[i].id] = { x: startX + i * (STUB_W + STUB_GAP), y: STUB_TOP };
  }
  return out;
}

/** Lista TableGroups distintos + página "sem grupo". */
export function pagesFromTableGroups(model: ParseResult): CanvasPage[] {
  const groups = new Set<string>();
  let hasUngrouped = false;
  for (const t of model.tables) {
    if (t.group) groups.add(t.group);
    else hasUngrouped = true;
  }
  const pages: CanvasPage[] = [...groups].sort().map((g) => ({
    id: g,
    name: g,
    tableGroups: [g],
  }));
  if (hasUngrouped) {
    pages.unshift({
      id: UNGROUPED_PAGE_ID,
      name: 'Sem grupo',
      tableGroups: [UNGROUPED_PAGE_ID],
    });
  }
  return pages;
}

export function allTablesPage(): CanvasPage {
  return { id: ALL_PAGE_ID, name: 'Todas', tableGroups: [ALL_PAGE_ID] };
}
