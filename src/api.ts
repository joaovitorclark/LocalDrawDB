// Cliente da API /api (mesma origem em prod; proxy do Vite em dev).

export type Project = { dbml: string; canvas: CanvasState };
export type Layer = { id: string; name: string; color: string };
export type LineageLink = { source: string; target: string };
export type CanvasState = {
  positions?: Record<string, { x: number; y: number }>;
  colors?: Record<string, string>;
  layers?: Record<string, string>; // tableId -> layerId
  customLayers?: Layer[];
  lineage?: LineageLink[];
  collapsedGroups?: string[];
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${url} -> ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) detail += `: ${j.error}`;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function loadProject(): Promise<Project> {
  const res = await fetch('/api/project');
  const j = (await res.json()) as { dbml: string; canvas: CanvasState };
  return { dbml: j.dbml ?? '', canvas: j.canvas ?? {} };
}

export async function saveProject(dbml: string, canvas: CanvasState): Promise<void> {
  const res = await fetch('/api/project', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dbml, canvas }),
  });
  if (!res.ok) throw new Error(`save -> ${res.status}`);
}

export const importFromInput = (dbml: string) =>
  post<{ dbml: string; imported: string[]; lineageFieldCount?: number; warnings?: string[] }>(
    '/api/import',
    { dbml },
  );

export const exportDdl = (dbml: string) => post<{ files: string[] }>('/api/export/ddl', { dbml });
export const exportDbt = (dbml: string) => post<{ files: string[] }>('/api/export/dbt', { dbml });
export const exportErwin = (dbml: string) =>
  post<{ files: string[] }>('/api/export/erwin', { dbml });
export const exportMermaid = (dbml: string) =>
  post<{ files: string[] }>('/api/export/mermaid', { dbml });
export const exportPng = (pngBase64: string) =>
  post<{ file: string }>('/api/export/png', { pngBase64 });

export type InputDialect = 'spark' | 'oracle' | 'auto';

export const exportInput = (dbml: string, dialect: InputDialect = 'spark') =>
  post<{ files: string[] }>('/api/export/input', { dbml, dialect });
