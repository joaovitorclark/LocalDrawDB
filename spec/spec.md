# Spec — LocalDrawDB

> Spec-driven development. Este documento descreve **o quê** e **por quê**.
> O **como** está em [`plan.md`](./plan.md); a quebra de tarefas em [`tasks.md`](./tasks.md).

## 1. Problema

Equipes de dados modelam tabelas de **lakehouse** (Spark/Databricks) e precisam de
uma ferramenta visual, **local e offline**, parecida com o dbdiagram.io, para:
desenhar tabelas, organizá-las e gerar DDL — sem depender de SaaS, sem instalar
Docker e sem subir um banco. Hoje os schemas vivem espalhados (planilhas, scripts
`.sql` soltos), sem uma visão de modelo única e versionável.

## 2. Personas

- **Modelador de dados / engenheiro de dados**: cria e organiza tabelas, define
  tipos lakehouse e relacionamentos, exporta DDL para Spark/dbt e um script para
  reverse-engineer no erwin.

## 3. User stories

1. Como modelador, escrevo tabelas numa **DSL textual** (estilo DBML) e vejo o
   **diagrama (ERD)** atualizar ao vivo.
2. Como modelador, **arrasto e agrupo** tabelas no canvas para organizar o modelo.
3. Como modelador, coloco arquivos `.sql` em `data/input/` e **importo** para ver as
   tabelas no canvas.
4. Como modelador, **exporto o DDL** das tabelas (Spark) para `data/output/`.
5. Como modelador, **exporto um projeto dbt** (models + `schema.yml`).
6. Como modelador, **exporto um PNG** do diagrama.
7. Como modelador, **exporto um script DDL** que o erwin importa via "Reverse
   Engineer from Script".
8. Como modelador, adiciono rapidamente as **colunas de metadados padrão** do
   lakehouse (transact_id, ingestion_timestamp, capture_timestamp, business_hash,
   content_hash, operation_type) a uma tabela.
9. Como modelador, meu trabalho **persiste** entre sessões (arquivo de projeto).

## 4. Critérios de aceite

- **AC1**: Editar a DSL atualiza o canvas sem recarregar; erros de sintaxe aparecem
  inline e não quebram o app.
- **AC2**: Importar `data/input/*.sql` cria/atualiza tabelas com nomes, colunas,
  tipos (incl. tamanho de `decimal`) e PKs corretos.
- **AC3**: Exportar DDL gera `data/output/*.sql` com `CREATE TABLE` Spark válido,
  preservando os tipos lakehouse.
- **AC4**: Exportar dbt gera `models/<schema>/<tabela>.sql` + `schema.yml` coerentes
  com o modelo.
- **AC5**: Exportar PNG produz uma imagem do diagrama atual.
- **AC6**: Exportar erwin gera um script DDL (ANSI) importável por reverse-engineer.
- **AC7**: Recarregar a página restaura o modelo a partir de `data/project.dbml` +
  `data/canvas.json`.
- **AC8**: `git status` nunca lista arquivos sob `data/`.

## 5. Não-objetivos (fora do escopo)

- Executar SQL ou conectar a qualquer banco/cluster (sem Docker, sem servidor de DB).
- Gerar o arquivo **`.erwin` nativo** (binário proprietário GDM) ou importar dele.
- Importador direto de `.xlsx` (substituído por `.sql`).
- Dialetos PostgreSQL/BigQuery/Snowflake no MVP.
- Empacotamento desktop (Tauri/Electron).

## 6. Restrições

- 100% local/offline; máquina-alvo **não** pode instalar Docker.
- Pasta `data/` jamais versionada (dados sensíveis).
- Stack único em **Node/TypeScript**, gerenciado por **npm**.
