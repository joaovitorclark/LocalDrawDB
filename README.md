# LocalDrawDB

## Requisitos

- **Node.js 20 LTS ou superior** (22 LTS recomendado para instalação nova)
- **npm 10+** (incluso no instalador oficial do Node)

Verifique antes de começar:

```bash
node -v   # v20.x ou v22.x
npm -v    # 10.x ou superior
```

Com [nvm](https://github.com/nvm-sh/nvm) ou [fnm](https://github.com/Schniz/fnm): na pasta do projeto, `nvm install` / `fnm install` (lê `.nvmrc`).

Nenhum banco, nenhum Docker.

## Rodando

```bash
npm install
npm run dev        # portas livres por clone (web + API pareadas automaticamente)
# o terminal mostra a URL web e o path do projeto
# segundo clone: npm run dev de novo — usa outras portas, data/input/ proprio
```

Produção (um processo serve UI + API):

```bash
npm run build
npm start          # http://localhost:5174
```

### Rodar projetos em portas isoladas

Por padrão, uma instância serve **todos** os projetos e você troca pelo seletor da UI.
Para abrir **vários projetos ao mesmo tempo** (cada um na sua porta) ou **fixar** uma
instância num projeto — útil para comparar lado a lado e **controlar o consumo de memória**:

```bash
npm run dev -- --project vendas        # 1 instância FIXADA no projeto "vendas"
npm run dev -- --projects vendas,rh    # 1 instância por projeto, cada uma na sua porta
npm run dev -- --all                   # 1 instância por projeto do projects.json
npm run dev -- --all --preview         # idem, servindo o build estático (leve, sem Vite)
```

- O argumento é o **slug** do projeto (mostrado em `projects.json`); slug inválido lista os
  disponíveis e aborta.
- Numa instância **fixada**, a UI mostra um rótulo **📌 \<projeto\>** no lugar do seletor —
  trocar/criar/excluir projeto fica desabilitado (cada instância serve só o seu projeto, e
  não interfere nas outras).
- **`--preview`** sobe, por projeto, **só** o servidor de produção (serve o `dist/` buildado
  + a API na mesma porta, **sem Vite**). É a forma leve de manter vários projetos abertos:
  rode `dev` (com HMR) no que você está editando e `--preview` nos que são só de leitura.
  Subir **tudo em modo dev** continua pesado por natureza (N Vites) — a economia vem de
  rodar só o necessário e usar `--preview` para o resto.

`Ctrl-C` encerra todas as instâncias do conjunto. Detalhes em
[`spec/per-project-ports-spec.md`](spec/per-project-ports-spec.md).

## Como usar

- **Editor (esquerda)**: DBML com realce de sintaxe, **Outline** (filtro + clique para ir à linha/tabela), fold de comentários.
- **Undo/Redo** (↶ ↷ ou Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z): histórico global (texto + canvas).
- **Organize**: reordena o DBML em `tabelas → refs → records → lineage` (preserva comentários).
- **+ Tabela / + Metadados**: nova tabela ou snippet de colunas lakehouse padrão.
- **Importar (input/)**: mescla `.sql` de `data/input/` (Spark, Oracle, `@layer`/`@group`/`@note`/`@fk`, `COMMENT ON`, PK composta). Exemplo versionado em [`examples/input/`](examples/input/) — copie para `data/input/`.
- **Exportar** (menu + botão): escolha o formato e gera artefatos em `data/output/`:
  - **LocalDrawDB (Spark/Oracle)** — SQL reimportável com metadados (`@map`, `@layer`, `INSERT`)
  - **Spark DDL** — `CREATE TABLE` Delta por schema
  - **Oracle DDL / PostgreSQL DDL** — `CREATE TABLE` + `ALTER TABLE` FK (sem metadados)
  - **erwin (ANSI)**, **dbt**, **Mermaid**
- **Export PNG**: download + `data/output/diagram.png`

### Interações no canvas

- **Hover** numa tabela destaca relações FK (verde) e esmaece o resto.
- **Crow's foot** nas pontas das relações.
- **Arrastar coluna → coluna** cria `Ref:` no DBML; reconectar ou Delete remove.
- **Painel Camadas** (canto superior direito): visibilidade por camada, esmaecer, **Mostrar linhagem**, busca de tabelas, **Organizar canvas**, modo linhagem.
- **Problemas** (canto inferior esquerdo): avisos/erros de modelo (PK ausente, ref inválida, linhagem quebrada).
- **Clicar coluna** → painel PK/FK/not null; **ⓘ** no header → metadados (sample, linhagem, FKs).
- **Cor por tabela** (●) e **TableGroup** / **LayerGroup** no DBML.

### Linhagem (tabela → tabela)

- Bloco `Lineage { destino < origem }` no DBML (distinto de FK).
- **Mostrar linhagem**: exibe arestas tracejadas sem entrar no modo edição.
- **Modo linhagem**: tabelas compactas, portas nas bordas (estilo draw.io); FKs ocultas; arrastar entre portas cria linhagem.

### Records (dados de exemplo)

Blocos `Records` preservados; painel **Dados (amostra)** filtra por tabela/grupo selecionado. `@note` no import SQL vai para Records, não para o `Table`.

> Identidade visual **Seguros Unimed** (azul-marinho + verde). Specs em [`spec/`](./spec).

## Salvamento

- **Salvar** (botão ou Cmd/Ctrl+S): grava `data/project.dbml` + `data/canvas.json`.
- **Auto-save** (toggle verde/vermelho na toolbar): salva automaticamente após 1,5s quando há alterações pendentes (desligado por padrão).
- Estados: **Salvando… / Salvo ✓ / ● Não salvo / ⚠ Falha ao salvar**.

## Contrato de dados

O repositório público contém **apenas** fixtures genéricas em [`examples/input/`](examples/input/) — principalmente [`demo_lakehouse_complex.sql`](examples/input/demo_lakehouse_complex.sql). Não versionamos modelos ou SQLs de domínios proprietários (ex.: autorização/TISS).

- **Copie** os exemplos para `data/input/` antes de importar.
- **Seu modelo** vive em `data/project.dbml` + `data/canvas.json` (gitignored).
- Trabalho local com dados sensíveis: branch `local/wip` ou pasta `data/` — **sem push**.

## Pasta `data/` (nunca versionada)

```
data/
├─ input/         # seus .sql locais (não versionados)
examples/input/   # demo_lakehouse.sql, demo_lakehouse_complex.sql + README (copiar para data/input/)
├─ output/        # localdrawdb/, spark/, oracle/, postgres/, dbt, erwin, Mermaid, PNG
├─ project.dbml   # fonte de verdade do modelo
└─ canvas.json    # posições, cores, grupos colapsados
```

## Exports

| Alvo | Saída | Observação |
|------|-------|------------|
| Spark/Databricks | `data/output/spark/<schema>.sql` | `CREATE TABLE ... USING DELTA` |
| dbt | `data/output/dbt/` | models `.sql` + `schema.yml` + `dbt_project.yml` |
| erwin | `data/output/erwin/modelo.sql` | DDL ANSI para Reverse Engineer |
| Mermaid | `data/output/mermaid/modelo.mmd` | `erDiagram` |
| PNG | download + `data/output/diagram.png` | captura do canvas |

## Testes & verificação

```bash
npm test           # Vitest
npm run typecheck
node scripts/verify-render.mjs   # headless (Chrome + servidor :5192)
```
