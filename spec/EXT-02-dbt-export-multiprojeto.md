# External · EXT-02 — Export DBT multiprojeto (ref cross-projeto + consolidação)

> **Restrição inegociável:** zero regressão no export DBT atual (por projeto),
> round-trip preservado, suíte verde. Aditivo.

## Problema

O export DBT (`server/dbtExport.ts` `modelToDbtFiles(model)`) opera sobre **um
`Model`** (projeto ativo). Resolve `ref()`/`source()` por `name`/`qualifiedName`
**dentro** do modelo (`findTable`, `upstreams`, `refExpr`). No desenho multiprojeto
da Fase 2 (`F2-03`/`F2-06`):

- Uma dimensão conformada referenciada por outro projeto **não está** no `Model`
  local (existe só como **proxy**, ver `EXT-01`). O gerador atual cai no
  `bareName` e pode não emitir `ref('<dim>')`/`source()` corretamente, nem marcar a
  origem como source vs model.
- Não há export **consolidado** dos N projetos num único `dbt project` com pastas
  por domínio.

## Metas / critérios de aceite

- **AC1 (ref cross-projeto):** ao exportar um projeto, refs/lineage cujo alvo é uma
  **proxy** (`Table.proxyOf` de `EXT-01`) geram `ref('<tabela_alvo>')` (ou
  `source()` se a dona for camada source), mesmo a tabela não estando no `Model`
  local.
- **AC2 (consolidação):** export consolidado que une os N projetos resolvendo
  proxies (reuso do utilitário de `EXT-01`) num único `dbt project`:
  `models/<dominio>/...`, dimensões conformadas em um único lugar, sem duplicar.
- **AC3:** `relationships` tests cross-projeto apontam para o `ref()` correto da
  dimensão dona.
- **AC4:** Materialization/resourceType por camada preservados (bronze=source/view,
  ouro=model/table) — `src/layers.ts`.
- **AC5:** Round-trip e suíte verde; export por projeto atual inalterado quando não
  há proxy.

## Design técnico (proposta)

### Resolução de alvo cross-projeto
- Estender `findTable`/`refExpr` (`server/dbtExport.ts`) para reconhecer
  `Table.proxyOf`: o alvo de uma ref para proxy resolve para `ref('<proxyOf.table>')`.
- Saber se a dona é source/model: consultar a camada da dona. Como a dona não está
  no `Model` local, manter um **catálogo leve** de dimensões conformadas
  (nome → projeto → camada/resourceType) gerado da consolidação, ou inferir pela
  convenção GD (`d_`/`f_` = model/ouro; `r_`/bronze = source).

### Export consolidado
- Novo modo (`exportDispatch`/rota) que:
  1. Carrega os N `project.dbml` (via `server/files.ts` `loadProjectBySlug`).
  2. Concatena em um `Model` único resolvendo proxies (utilitário de `EXT-01`).
  3. Roda `modelToDbtFiles` sobre o modelo consolidado, com `models/<dominio>/`
     derivado do `@group`/projeto.
- Garantir unicidade: cada dimensão conformada aparece 1× nos arquivos.

### Convenção de schema/origem (GD)
- Sources = bronze `bronze_<seg>_<sis>`; models = ouro `ouro_<seg>_dw`
  (`Fase 2/F2-01`). Usar como `schema`/`source name` no YAML.

## Arquivos a tocar (estimado)

| Área | Arquivos |
|------|----------|
| Export | `server/dbtExport.ts` (resolução proxy, consolidação), `server/exportDispatch.ts` (novo formato/modo) |
| Multiprojeto | `server/files.ts` (ler N projetos), `server/routes.ts` (rota de export consolidado) |
| Modelo | depende de `EXT-01` (`Table.proxyOf`, utilitário de consolidação) |
| UI | `src/api.ts`/`ExportMenu.tsx` (opção "Export DBT consolidado") |
| Testes | export por projeto com proxy; export consolidado; relationships cross-projeto |

## Dependências

- **Requer `EXT-01`** (proxy + consolidação de proxies).

## Riscos & compat

- **Duplicar dimensão conformada** na consolidação → resolver por nome canônico único.
- **Ref para dona ausente** → fallback para `ref('<bareName>')` + warning (não quebrar).
- **Export por projeto atual** deve permanecer idêntico quando não há proxy.

## Fora de escopo

- SQL de transformação executável a partir do `@map` L2 (fase futura "F5" do app,
  ver `LocalDrawDB/spec/dbt-integration-spec.md`).
