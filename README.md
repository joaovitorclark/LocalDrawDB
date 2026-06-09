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

- **Editor (esquerda)**: DBML com realce de sintaxe, **Outline** (filtro + clique para ir à linha/tabela), fold de comentários.
- **Undo/Redo** (↶ ↷ ou Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z): histórico global (texto + canvas).
- **Organize**: reordena o DBML em `tabelas → refs → records → lineage` (preserva comentários).
- **+ Tabela / + Metadados**: nova tabela ou snippet de colunas lakehouse padrão.
- **Importar (input/)**: mescla `.sql` de `data/input/` (Spark, Oracle, `@layer`/`@group`/`@note`/`@fk`, `COMMENT ON`, PK composta). Exemplo versionado em [`examples/input/`](examples/input/) — copie para `data/input/`.
- **Export DDL / dbt / erwin / Mermaid / PNG**: artefatos em `data/output/`.

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

## Pasta `data/` (nunca versionada)

```
data/
├─ input/         # seus .sql locais (não versionados)
examples/input/   # demo_lakehouse.sql, demo_lakehouse_complex.sql + README (copiar para data/input/)
├─ output/        # DDL, dbt, erwin, Mermaid, PNG
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
