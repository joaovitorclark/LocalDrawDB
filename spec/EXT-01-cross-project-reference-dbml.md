# External · EXT-01 — Referência cross-projeto no DBML (tabela-proxy)

> **Restrição inegociável:** zero regressão no parsing DBML/SQL atual (DBML legado
> continua parseando), round-trip preserva semântica, suíte de testes verde.
> Feature **aditiva** e opcional.

## Problema

O app é multiprojeto (`server/files.ts`): cada projeto tem seu `project.dbml`. Mas
o modelo de dados desenhado nas fases tem **dimensões conformadas** que vivem num
projeto e são **referenciadas** por fatos/dimensões de **outros** projetos
(`Fase 2/F2-03`). Hoje:

- `server/dbmlIo.ts` `modelToDbml()` serializa `Ref: a.col > b.col` e só conhece
  tabelas do **mesmo** `Model`. Não há como representar "esta coluna referencia uma
  tabela que pertence a outro projeto" sem **importar a tabela inteira**.
- `dbmlToModel()` resolve refs por nome dentro do projeto; refs para tabelas
  ausentes viram refs órfãs (warning) ou somem.
- O `ExternalGroupNode` (`src/canvas/ExternalGroupNode.tsx`) trata "fora da página"
  **dentro** do projeto — não cobre cross-projeto.

## Comportamento desejado (definição do usuário)

Quando uma tabela de um projeto se conecta a uma dimensão de **outro** projeto:

- **Nos arquivos** (`.sql`/lineage de input): manter a **referência normal e
  qualificada** (`ouro_prestador.d_sd_xx_prestador.cd_prestador`). Os projetos são
  **concatenáveis**; ao unir os DBMLs, a ref resolve entre si. **Nada muda** aqui.
- **No DBML do projeto corrente** (visão local): representar a dependência por uma
  **tabela-proxy** cujo:
  - **nome = nome do projeto dono** (ex.: `ouro_prestador`);
  - **único "campo" = nome da tabela** referenciada (ex.: `d_sd_xx_prestador`).
  - A ref do projeto corrente aponta para `proxy.<campo>`:
    `Ref: f_sd_tps_autorizacao.cd_prestador_solicitante > ouro_prestador.d_sd_xx_prestador`.

Exemplo:

```dbml
Table ouro_prestador {            // nome = projeto dono
  d_sd_xx_prestador               // campo = tabela referenciada
}
Ref: f_sd_tps_autorizacao.cd_prestador_solicitante > ouro_prestador.d_sd_xx_prestador
```

A proxy **não** redefine colunas da dimensão — é só uma âncora visual/lógica para a
ligação cross-projeto.

## Metas / critérios de aceite

- **AC1:** Modelar uma ref cujo alvo é tabela de outro projeto **sem** copiar a
  dimensão; o canvas mostra a tabela-proxy (nome do projeto) com 1 entrada (a
  tabela referenciada) e a aresta da ref.
- **AC2:** Round-trip: DBML com proxy → modelo → DBML idêntico (idempotente).
- **AC3:** DBML legado (sem proxy) continua parseando igual; nenhuma ref existente
  muda de comportamento.
- **AC4:** Distinção visual clara entre tabela normal e proxy cross-projeto
  (reaproveitar estilo do `ExternalGroupNode`).
- **AC5:** Ao **concatenar** os projetos (consolidação), a proxy é resolvida para a
  tabela real (a ref vira ref normal entre tabelas) — sem duplicar a dimensão.
- **AC6:** Suíte de testes (~150+) verde; novos testes de round-trip da proxy.

## Design técnico (proposta)

### Modelo canônico (`server/model.ts`)
- Marcar a tabela-proxy de forma não ambígua. Opções (escolher 1):
  - `Table.external?: { project: string; table: string }` — proxy explícita; ou
  - convenção: proxy = tabela cujo `name` casa um slug de projeto e que tem um
    único "campo" sem tipo.
- Recomendado: **flag explícita** `Table.proxyOf?: { project: string; table: string }`
  para evitar heurística frágil. Serializada em bloco dedicado (ver abaixo).

### Serialização DBML (`server/dbmlIo.ts`)
- `modelToDbml()`: emitir a proxy como `Table <project> { <table> }` **ou** num
  bloco dedicado (preferível p/ não confundir com tabela real), ex.:
  ```dbml
  External {
    ouro_prestador.d_sd_xx_prestador
    ouro_cliente.d_sd_xx_contrato
  }
  ```
  e as refs apontando para `ouro_prestador.d_sd_xx_prestador`.
- `dbmlToModel()`: parsear o bloco/forma de proxy → `Table.proxyOf`; **não** tratar
  como tabela com colunas; refs para proxy ficam válidas (não órfãs).
- Reusar `extractRecords()`/`dbmlClean.ts` se optar por bloco custom (como já é
  feito p/ `Lineage`, `LineageFields`, `Dbt`, `Records`).

> Decisão de formato (`Table <project>{table}` literal pedido pelo usuário **vs**
> bloco `External { … }`) fica a cargo do agente do app, **desde que** a forma
> literal pedida (`Table <nome_do_projeto> { <nome_da_tabela> }`) seja **aceita na
> leitura**. A escrita pode normalizar para a forma mais robusta.

### Canvas (`src/canvas/`)
- Renderizar a proxy com um nó tipo `ExternalGroupNode` (rótulo = projeto, item =
  tabela), com handles para receber a aresta da ref.
- Tooltip: "Dimensão conformada em outro projeto — definida em `<project>`".

### Geração automática a partir das refs (qualidade de vida)
- Ao detectar uma ref cujo alvo é qualificado com um **slug de projeto conhecido**
  (do `projects.json`) diferente do atual, **gerar a proxy automaticamente**.
- Comando/ação: "Materializar refs cross-projeto" (botão ou no organize).

### Consolidação (AC5)
- Função utilitária que, dado o conjunto dos N projetos, **resolve** as proxies:
  substitui cada proxy pela tabela real (única) e converte as refs de proxy em refs
  normais. Base para o export consolidado de `EXT-02`.

## Arquivos a tocar (estimado)

| Área | Arquivos |
|------|----------|
| Modelo | `server/model.ts` (`Table.proxyOf`) |
| DBML I/O | `server/dbmlIo.ts`, `src/dsl/dbmlClean.ts` (bloco custom), `src/dsl/parse.ts` |
| Organize/validação | `src/dsl/organize.ts` (ordem do bloco), `src/dsl/validateModel.ts` |
| Canvas | `src/canvas/ExternalGroupNode.tsx` (reuso), `Canvas.tsx`, hooks de nodes/edges |
| Multiprojeto | `server/files.ts` (ler `projects.json` p/ reconhecer slugs) |
| Testes | round-trip proxy, parse da forma literal, consolidação |

## Riscos & compat

- **Confundir proxy com tabela real** → flag explícita `proxyOf` + bloco dedicado.
- **DBML legado** → forma nova é aditiva; ausência = comportamento atual.
- **Refs órfãs** → proxy torna a ref válida; sem proxy, segue como hoje (warning).
- **Slug colidindo com nome de tabela** → desambiguar por `projects.json` +
  qualificação `projeto.tabela`.

## Fora de escopo

- Export DBT cross-projeto (→ `EXT-02`).
- Sincronizar conteúdo/colunas da dimensão entre projetos (a proxy é só referência).
