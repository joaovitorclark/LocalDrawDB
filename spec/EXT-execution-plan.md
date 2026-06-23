# EXT-01 / EXT-02 — Plano de execução (referência cross-projeto + export dbt multiprojeto)

> **For agentic workers:** este é um plano **sequenciado com gates de decisão**, não um
> plano bite-sized de código. As specs `spec/EXT-01-cross-project-reference-dbml.md` e
> `spec/EXT-02-dbt-export-multiprojeto.md` têm decisões de design em aberto que **precisam
> ser fechadas antes** de virar tarefas TDD detalhadas. Cada fase abaixo termina com um
> entregável testável; o detalhamento bite-sized de cada fase é produzido (via
> `superpowers:writing-plans`) ao se iniciar a fase, após o gate correspondente.

**Goal:** Representar referências a dimensões conformadas de **outros** projetos sem copiar
a dimensão (EXT-01) e exportar dbt resolvendo essas referências por projeto e de forma
consolidada (EXT-02).

**Architecture:** Uma **tabela-proxy** (`Table.proxyOf`) ancora a dependência cross-projeto
no DBML local; um utilitário de **consolidação** resolve proxies para as tabelas reais ao
unir os N projetos; o export dbt reconhece proxies para emitir `ref()`/`source()` corretos.

**Tech Stack:** TypeScript (`server/*.ts`, `src/dsl/*.ts`), `@dbml/core` + blocos custom
(`src/dsl/dbmlClean.ts`), React Flow (`src/canvas/*`), Vitest.

## Global Constraints (verbatim das specs)

- **EXT-01:** "zero regressão no parsing DBML/SQL atual (DBML legado continua parseando),
  round-trip preserva semântica, suíte de testes verde. Feature aditiva e opcional."
- **EXT-02:** "zero regressão no export DBT atual (por projeto), round-trip preservado,
  suíte verde. Aditivo." + "export por projeto atual deve permanecer idêntico quando não
  há proxy."
- Fixtures genéricas, sem dados proprietários (`examples/`).
- EXT-02 **depende** de EXT-01 (proxy + consolidação).

---

## Pré-requisito: GATE DE DECISÕES (fechar antes de qualquer código)

Três decisões em aberto, levantadas na avaliação das specs. Devem ser resolvidas com o
usuário e **registradas na spec** antes de F1.

- **D1 — Origem do "dono" da ref cross-projeto (a pedra angular).**
  Como o app sabe que `d_sd_xx_prestador` pertence ao projeto `ouro_prestador`?
  - **Proposta recomendada:** derivar o dono do **qualificador de schema** do alvo da ref
    (`ouro_prestador.d_sd_xx_prestador`) quando o schema casar um **slug de projeto
    conhecido** (`projects.json`). Sem catálogo global no caminho feliz.
  - Decidir: é só schema=slug? Há fallback por catálogo (carregar N DBMLs e indexar
    tabela→projeto)? Quando o catálogo é construído/invalidado?
- **D2 — Forma canônica de armazenamento da proxy.**
  - **Proposta recomendada:** **bloco `External { ouro_prestador.d_sd_xx_prestador }`** como
    forma de **escrita** (evita colisão com tabela real e suporta N tabelas por projeto);
    **aceitar** a forma literal `Table <projeto> { <tabela> }` apenas na **leitura**.
  - Consequência: **AC2 (idempotência) deve ser escopado** a "idêntico **após
    normalização**" — a forma literal de entrada não volta literal.
- **D3 — Source vs model da dona ausente (EXT-02).**
  - **Proposta recomendada:** **primário** = ler a camada/`resourceType` **real** da dona
    (a consolidação já carrega o projeto dono); **fallback** = inferência por convenção de
    prefixo (`d_`/`f_`=model, bronze/`r_`=source) só quando o dono não está disponível.
  - Decidir: aceitar embutir a convenção de prefixo como fallback no app?

> **Saída do gate:** editar `EXT-01`/`EXT-02` com as decisões (D1/D2/D3), incluindo o
> reparo de AC2. Só então detalhar F1 em bite-sized.

---

## EXT-01 — Referência cross-projeto (tabela-proxy)

### Fase E1.1 — Modelo + flag explícita
**Entregável:** `Table.proxyOf?: { project: string; table: string }` em `server/model.ts`,
mais helpers de identificação. Sem serialização ainda.
**Arquivos:** `server/model.ts`.
**Testes:** unit do tipo + um helper `isProxy(table)`; suíte verde.
**Aceite parcial:** modelo representa a proxy sem ambiguidade (base do AC1/AC3).

### Fase E1.2 — Serialização DBML (escrita + leitura)
**Entregável:** `modelToDbml()` emite o bloco `External { … }` (forma D2); `dbmlToModel()`
parseia **tanto** o bloco quanto a forma literal `Table <projeto> { <tabela> }` →
`Table.proxyOf`; refs para proxy ficam **válidas** (não órfãs).
**Arquivos:** `server/dbmlIo.ts`, `src/dsl/dbmlClean.ts` (novo bloco custom, padrão de
`Dbt`/`Lineage`/`Records`), `src/dsl/parse.ts`.
**Testes:** round-trip idempotente **após normalização** (AC2 reparado); leitura da forma
literal; DBML legado sem proxy inalterado (AC3); ref para proxy não vira órfã.
**Aceite:** AC2, AC3.

### Fase E1.3 — Canvas (distinção visual)
**Entregável:** proxy renderizada reusando `ExternalGroupNode` (rótulo = projeto, item =
tabela), com handles para a aresta da ref; tooltip "Dimensão conformada em outro projeto".
**Arquivos:** `src/canvas/ExternalGroupNode.tsx` (reuso), `src/canvas/Canvas.tsx`, hooks de
nodes/edges, `src/canvas/pageFilter.ts` se necessário.
**Testes:** verificação no navegador (Chrome do sistema) — proxy aparece distinta, com a
aresta; zero erros de console.
**Aceite:** AC1, AC4.

### Fase E1.4 — Auto-materialização a partir das refs
**Entregável:** ao detectar ref cujo alvo é qualificado com slug de projeto conhecido
(decisão D1), gerar a proxy automaticamente; ação "Materializar refs cross-projeto".
**Arquivos:** `src/dsl/organize.ts`/`src/dsl/validateModel.ts`, `server/files.ts` (ler
`projects.json` para slugs), UI de ação.
**Testes:** dado um DBML com ref a `slug.tabela`, a proxy é criada; sem slug conhecido,
segue como hoje (warning).
**Aceite:** qualidade de vida da spec (seção "Geração automática").

### Fase E1.5 — Consolidação (resolução de proxies)
**Entregável:** utilitário que, dados N projetos, substitui cada proxy pela tabela real
(única) e converte refs de proxy em refs normais. Base para EXT-02.
**Arquivos:** novo `server/consolidate.ts` (ou em `server/files.ts`), reuso de
`loadProjectBySlug`/`listProjects`.
**Testes:** 2 projetos genéricos (`alpha` com fato + proxy → `beta` com a dimensão);
consolidar resolve a proxy sem duplicar a dimensão (AC5).
**Aceite:** AC5. **Suíte verde, novos testes de round-trip da proxy (AC6).**

---

## EXT-02 — Export dbt multiprojeto (requer EXT-01)

### Fase E2.1 — Resolução de alvo cross-projeto no export por projeto
**Entregável:** `findTable`/`refExpr` em `server/dbtExport.ts` reconhecem `Table.proxyOf`:
ref para proxy resolve para `ref('<proxyOf.table>')` (ou `source()` se a dona for camada
source, conforme D3), mesmo a dona não estando no `Model` local.
**Arquivos:** `server/dbtExport.ts`; `src/layers.ts` (consulta de camada).
**Testes:** export de um projeto com proxy emite `ref()`/`source()` correto; export **sem**
proxy permanece **idêntico** ao atual (regressão).
**Aceite:** AC1, AC4, AC5 (parte "inalterado sem proxy").

### Fase E2.2 — Relationships cross-projeto
**Entregável:** testes `relationships` cuja dimensão alvo é uma proxy apontam para o
`ref()` correto da dona.
**Arquivos:** `server/dbtExport.ts` (`columnTests`/relationships).
**Testes:** FK cross-projeto → `relationships: { to: ref('<dim>'), field: <pk> }`.
**Aceite:** AC3.

### Fase E2.3 — Export consolidado (N projetos → 1 dbt project)
**Entregável:** novo modo/rota que carrega os N `project.dbml` (`loadProjectBySlug`),
concatena resolvendo proxies (utilitário de E1.5) e roda `modelToDbtFiles` sobre o modelo
consolidado, com `models/<dominio>/` derivado de `@group`/projeto; cada dimensão conformada
aparece **1×**.
**Arquivos:** `server/dbtExport.ts`, `server/exportDispatch.ts` (novo modo),
`server/files.ts` (ler N projetos), `server/routes.ts` (rota de export consolidado).
**Testes:** export consolidado de 2 projetos genéricos: dimensão única, refs cross-projeto
resolvidas, sem duplicação.
**Aceite:** AC2.

### Fase E2.4 — UI do export consolidado
**Entregável:** opção "Export DBT consolidado" no `ExportMenu`.
**Arquivos:** `src/api.ts`, `src/canvas/ExportMenu.tsx` (ou equivalente).
**Testes:** verificação no navegador — opção aparece e dispara o download; zero erros.
**Aceite:** fechamento de UX.

---

## Sequenciamento e dependências

```
GATE (D1, D2, D3 + reparo AC2)
   └─> EXT-01:  E1.1 → E1.2 → E1.3 → E1.4 → E1.5
                                              └─> EXT-02: E2.1 → E2.2 → E2.3 → E2.4
```

- **E2.* não começa antes de E1.5** (consolidação) e E1.2 (proxyOf serializado).
- Cada fase é um PR/checkpoint independente com suíte verde.
- Recomendo **um plano bite-sized por spec** ao chegar nela (EXT-01 primeiro), seguindo o
  mesmo padrão TDD do `spec/per-project-ports-plan.md`.

## Riscos herdados das specs (rastrear)

- **Catálogo projeto→tabela** (D1): se a regra schema=slug não cobrir todos os casos, o
  fallback por catálogo precisa de design de cache/invalidação — pode virar uma fase extra.
- **Conformidade de dimensões:** consolidação assume que a dimensão conformada é **idêntica**
  entre projetos; divergência de conteúdo não é tratada (registrar como premissa).
- **Convenção de prefixo (D3):** embutir `d_`/`f_`/`r_` no app é específico de organização —
  manter só como fallback e documentar.

## Self-review (cobertura)

- EXT-01 AC1→E1.3, AC2→E1.2, AC3→E1.2, AC4→E1.3, AC5→E1.5, AC6→E1.5 (+ suíte por fase).
- EXT-02 AC1→E2.1, AC2→E2.3, AC3→E2.2, AC4→E2.1, AC5→E2.1/E2.3.
- Decisões abertas isoladas no GATE para não contaminarem o detalhamento TDD.
