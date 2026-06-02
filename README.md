# LocalDrawDB

Modelador **local e offline** de bancos/lakehouses, estilo
[dbdiagram.io](https://dbdiagram.io), com foco em tabelas Spark/Databricks.
Edite tabelas numa DSL textual (DBML), veja o diagrama (ERD) ao vivo, importe
`.sql` e exporte **DDL Spark, projeto dbt, PNG** e um **script para reverse-engineer
no erwin**. Sem Docker, sem servidor de banco.

> Construído com **spec-driven development** — veja [`spec/`](./spec).

## Requisitos

- Node.js 20+ e npm (nenhum banco, nenhum Docker).

## Rodando

```bash
npm install
npm run dev        # Vite (5173) + API Fastify (5174), com proxy
# abra http://localhost:5173
```

Produção (um processo serve UI + API):

```bash
npm run build
npm start          # http://localhost:5174
```

## Como usar

- **Editor (esquerda)**: escreva tabelas em DBML (realce de sintaxe). O canvas
  atualiza ao vivo; erros de sintaxe aparecem inline sem apagar o diagrama.
- **Undo/Redo** (↶ ↷ ou Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z): histórico global que
  desfaz tanto edições de texto quanto ações do canvas (cor, posição, relações).
- **Organize**: reordena o DBML em `tabelas → refs → records` (preserva comentários).
- **+ Tabela / + Metadados**: insere uma tabela nova ou o bloco de colunas de
  metadados padrão do lakehouse (transact_id, ingestion_timestamp, ...).
- **Importar (input/)**: lê todos os `.sql` de `data/input/` e mescla no modelo.
- **Export DDL / dbt / erwin / PNG**: gera artefatos em `data/output/`.

### Interações no canvas

- **Hover** numa tabela destaca suas relações (verde) e esmaece o resto.
- **Crow's foot**: a cardinalidade (`*`/`1`) é desenhada nas pontas das relações.
- **Arrastar de uma coluna para outra** cria uma relação (escreve `Ref:` no DBML);
  a aresta ancora na **coluna correta** (origem e destino).
- **Selecionar uma relação** (clique) e **Delete/Backspace** — ou o botão **✕** sobre
  ela — remove o `Ref`. **Arrastar a ponta** de uma relação a reconecta a outra coluna.
- Arrastar tabelas é estável (a posição é preservada e salva em `data/canvas.json`).
- **Clicar numa coluna** abre o painel de propriedades (pk / not null / note / default).
- **Duplo-clique** no nome da coluna renomeia; **+ coluna** adiciona uma coluna.
- **Duplo-clique** no nome da tabela renomeia (atualiza refs e grupos).
- **Cor por tabela** (botão ● no header) e **grupos visuais** (TableGroup) — cor e
  layout ficam em `data/canvas.json`, nunca no DBML.

### Records (dados de exemplo)

Blocos `Records` do DBML são **preservados** e exibidos como **amostra** num painel
sob o canvas (o parser não os suporta, então são tratados à parte).

> Identidade visual **Seguros Unimed** (azul-marinho + verde). Specs em [`spec/`](./spec).

## Salvamento

O projeto é salvo automaticamente (debounced) em `data/` a cada edição. A toolbar
mostra o estado: **Salvando… / Salvo ✓ / ⚠ Falha ao salvar**. Se aparecer "Falha ao
salvar", o backend não está respondendo — confira se o servidor está no ar
(`npm run dev` sobe Vite **e** Fastify juntos).

## Pasta `data/` (nunca versionada)

Tudo do usuário fica em `data/` (ignorada pelo git):

```
data/
├─ input/         # coloque seus .sql aqui para importar
├─ output/        # DDL Spark, projeto dbt, PNG e script erwin gerados
├─ project.dbml   # persistência do modelo (fonte de verdade)
└─ canvas.json    # posições das tabelas no canvas
```

## Exports

| Alvo | Saída | Observação |
|------|-------|-----------|
| Spark/Databricks | `data/output/spark/<schema>.sql` | `CREATE TABLE ... USING DELTA` |
| dbt | `data/output/dbt/` | models `.sql` + `schema.yml` + `dbt_project.yml` |
| erwin | `data/output/erwin/modelo.sql` | script DDL ANSI para "Reverse Engineer from Script" |
| Mermaid | `data/output/mermaid/modelo.mmd` | diagrama `erDiagram` |
| PNG | download + `data/output/diagram.png` | imagem do diagrama |

O `.erwin` nativo é binário proprietário e **não** é gerado — o caminho suportado
é o script DDL acima.

## Testes & verificação

```bash
npm test           # Vitest: round-trips import/export
npm run typecheck  # tsc --noEmit
node scripts/verify-render.mjs   # render headless (precisa do Chrome + servidor no :5192)
```
