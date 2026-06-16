/** Limiar: virtualizar lista de colunas no TableNode. */
export const COLUMN_VIRTUALIZE_THRESHOLD = 48;

/** Altura de linha (px) — alinhada a nodeMetrics.ROW_H e CSS .col-row. */
export const COLUMN_VIRTUAL_ROW_H = 25;

/** Linhas visíveis no viewport virtual (scroll interno). */
export const COLUMN_VIRTUAL_VIEW_ROWS = 14;

/** Overscan acima/abaixo do viewport virtual. */
export const COLUMN_VIRTUAL_OVERSCAN = 3;

/** Limiar: ocultar MiniMap (custo de pintura). */
export const MINIMAP_MAX_TABLES = 200;

/** Limiar: pular fitView automático no primeiro frame. */
export const SKIP_INITIAL_FIT_TABLES = 200;

/** Limiar: sugerir páginas / wizard pós-import. */
export const PAGE_WIZARD_THRESHOLD = 500;

/** Limiar: mensagem de diagrama grande no status. */
export const LARGE_DIAGRAM_HINT = 200;

/** Id da página virtual "todas as tabelas". */
export const ALL_PAGE_ID = '__all__';

/** Id da página virtual para tabelas sem TableGroup. */
export const UNGROUPED_PAGE_ID = '__ungrouped__';
