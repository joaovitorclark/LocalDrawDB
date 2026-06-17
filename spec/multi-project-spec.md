# Spec: Multi-projeto (trocar de projeto dentro do app)

> Restrição inegociável: **zero regressão no fluxo single-project atual** (compatibilidade
> retroativa) e suíte de testes (~150) verde. Migração automática e idempotente.

## Problema

Hoje o app é **single-project**: estado e persistência presos a um único par de arquivos.
Trabalhar com modelos grandes (ex.: 2 mil colunas) é inviável porque não dá para ter dois
modelos abertos e alternar entre eles — só existe um projeto persistido e um único `input/`.

Pontos hardcoded a um arquivo só:
- `server/files.ts:10-11` — `PROJECT_DBML` / `CANVAS_JSON` (constantes de caminho fixo).
- `server/files.ts:39-56` — `loadProject()` / `saveProject()` sempre nos mesmos paths.
- `server/files.ts:17-28` — `readInputSql()` lê `data/input/` global.
- `server/routes.ts` — `GET/PUT /api/project`, `POST /api/import` (sem id de projeto).
- `src/api.ts:76-95` — `loadProject` / `saveProject` / `importFromInput` para endpoint único.
- `src/App.tsx:131-176` — load único no mount; `233-246` — save/autosave de um projeto só.

Não existe `projectId` / `projectName` / seletor em lugar nenhum do código.

## Metas / critérios de aceite

- Criar, renomear, duplicar e excluir projetos pela UI.
- Alternar entre projetos sem perder posições/cores/páginas/grupos colapsados.
- **Undo/redo, autosave e save-state isolados por projeto.**
- Projeto antigo (`data/project.dbml` + `data/canvas.json`) **migrado sem perda** na primeira
  subida; `data/input/` e `data/output/` legados migram junto.
- Endpoints legados continuam funcionando (compat retroativa) durante a transição.
- 150 testes verdes.

## Layout no disco (decisão fechada)

```
data/
  projects/
    <slug>/
      project.dbml
      canvas.json
      input/      ← .sql/.yml deste projeto (antes era data/input/ global)
      output/     ← exports deste projeto
  projects.json   ← registry: [{ id, name, slug, createdAt, updatedAt }]
```

- `slug`: derivado do nome (kebab-case, único). `id`: estável (uuid curto) — usado nas rotas.
- **Migração** (idempotente, roda no boot): se existir `data/project.dbml` e não existir
  `data/projects/`, mover `project.dbml` + `canvas.json` para `data/projects/default/`,
  mover `data/input/` → `data/projects/default/input/` e `data/output/` →
  `data/projects/default/output/`, e registrar `{ name: "default" }` em `projects.json`.
  Se já houver `projects/`, não fazer nada.

## Plano em fases (cada fase independente e testável)

### F0 — Camada de projeto no servidor (`server/files.ts`)
- `projectDir(slug)` resolve `data/projects/<slug>/`; helpers `projectDbmlPath`,
  `projectCanvasPath`, `projectInputDir`, `projectOutputDir`.
- `readRegistry()` / `writeRegistry()` para `projects.json`.
- CRUD: `listProjects()`, `createProject(name)`, `renameProject(id, name)`,
  `deleteProject(id)`, `duplicateProject(id)` (copia dbml+canvas+input opcional).
- `loadProject(slug)` / `saveProject(slug, dbml, canvas)` parametrizados por slug.
- `migrateLegacy()` idempotente chamada no boot (`server/index.ts`).
- Testes unitários da camada (registry, slug único, migração idempotente).

### F1 — Rotas (`server/routes.ts`, `server/routes/`)
- `GET /api/projects` (lista), `POST /api/projects` (criar → retorna id),
  `GET /api/projects/:id`, `PUT /api/projects/:id`, `DELETE /api/projects/:id`,
  `POST /api/projects/:id/duplicate`, `PATCH /api/projects/:id` (renomear).
- `POST /api/projects/:id/import` e export por projeto (param `:id`).
- **Compat:** manter `GET/PUT /api/project` e `POST /api/import` apontando para o projeto
  "ativo" (o primeiro do registry, ou um marcado como default) até o front migrar; remover
  numa fase posterior.

### F2 — Estado no front (`src/App.tsx`, `src/api.ts`, opcional `src/store/`)
- `currentProjectId` no `App.tsx` (ou store leve `useProjects` com lista + id atual).
- `src/api.ts`: `listProjects`, `createProject`, `renameProject`, `deleteProject`,
  `duplicateProject`, `loadProject(id)`, `saveProject(id, …)`, `importFromInput(id, dbml)`.
- **Undo/redo por projeto:** ao trocar, resetar `past`/`future`/`baselineRef`
  (`App.tsx:125-127`) e `saveState`. Trocar = persistir/descartar pendências do atual +
  carregar o novo (com confirmação se houver alterações não salvas).

### F3 — UI de troca (`src/App.tsx` toolbar)
- Seletor de projeto na `.toolbar` ao lado do `.brand` (`App.tsx:964`): dropdown com lista,
  "+ Novo", renomear, duplicar, excluir.
- Indicador de "não salvo" por projeto. Reaproveitar padrões visuais de painel/menu
  existentes (ex.: `ExportMenu.tsx`).

### F4 — Import/export por projeto (`server/files.ts`, rotas)
- `readInputSql(slug)` lê `projects/<slug>/input/`; exports gravam em
  `projects/<slug>/output/`.
- Wizard de páginas e demais fluxos inalterados além do path.

## Arquivos a tocar (por fase)
| Fase | Arquivos |
|------|----------|
| F0 | `server/files.ts`, `server/index.ts`, `server/__tests__/` |
| F1 | `server/routes.ts`, `server/routes/`, `server/exportDispatch.ts` (param de output) |
| F2 | `src/api.ts`, `src/App.tsx`, opcional `src/store/projects.ts` |
| F3 | `src/App.tsx`, possivelmente novo `src/ProjectSwitcher.tsx`, `src/styles.css` |
| F4 | `server/files.ts`, `server/routes.ts` |

## Riscos
- **Perda de dados na migração** → migração idempotente, só move quando seguro; cobertura de
  teste; nunca sobrescreve `projects/` existente.
- **Histórico vazando entre projetos** → reset explícito de undo/redo + baseline ao trocar.
- **Quebra de URLs/endpoints legados** → manter rotas antigas até o front migrar 100%.
- **Slug colidindo** → unicidade garantida no registry (sufixo numérico).
