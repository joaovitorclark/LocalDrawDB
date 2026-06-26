# v13-01 — Sync de projetos no launch (add-only)

## Objetivo

Ao rodar o dev, projetos criados **na mão** em `data/projects/<slug>/` devem ser
mapeados automaticamente no `projects.json`. Hoje `ensureRegistry()` só age quando
o arquivo está ausente; com o registry presente, pastas novas são ignoradas.

## Decisão

Sync **add-only**: adiciona ao registry toda pasta de `projects/` sem entrada
correspondente. **Nunca remove** entradas (seguro contra perda acidental).

## A. `syncRegistryWithDisk()` em `server/files.ts`

1. Lê o registry atual e os slugs de `projects/` (subdiretórios) via helper `projectSlugsOnDisk()`.
2. Para cada slug sem entrada no registry, cria um `ProjectMeta` (`name = slug`, id/datas novos).
3. Persiste com `writeRegistry()` **apenas se** houve adição (idempotente).
4. Mantém a ordem das entradas existentes; novas vão ao final.

## B. Integração

1. `ensureRegistry()` passa a chamar `syncRegistryWithDisk()` no caminho "arquivo presente".
   - Ausente + projetos no disco → reconstrói (comportamento atual).
   - Ausente + sem projetos → `migrateLegacy()` (atual).
   - **Presente → sync add-only** (novo).
2. Já roda nos 3 pontos existentes: launcher (via `scripts/ensureRegistry.ts`), `server/index.ts`, `server/routes.ts`. Sem novas chamadas.

## Critérios de aceite

- AC1: registry presente + `mkdir data/projects/vendas` → após `./ldb --list`, `vendas` aparece listado e em `projects.json`.
- AC2: entradas existentes (id/name/datas) permanecem inalteradas.
- AC3: rodar duas vezes sem mudanças no disco não reescreve o arquivo (idempotente).

## Testes (TDD)

- `server/__tests__/projects.test.ts`: pasta nova com registry presente → aparece após `ensureRegistry()`; entradas antigas intactas; ordem estável; sem reescrita quando nada muda.
