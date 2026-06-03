# Spec v7 — Notação CONSTRAINT e mapeamento completo de FKs (inclusive compostas)

## Contexto

A camada silver de `autorizacao` foi escrita com PK/FK em notação de CONSTRAINT
nomeada, no padrão:

```sql
CONSTRAINT pk_stg_pedido PRIMARY KEY (num_pedido),
CONSTRAINT fk_stg_pedido_cliente FOREIGN KEY (cod_cliente)
  REFERENCES staging.cliente (cod_cliente)
```

Hoje o importador (`server/sqlImport.ts`) entende essa forma, mas com uma
**limitação**: o regex de FK só captura **uma coluna** por constraint
(`FOREIGN KEY ( col ) REFERENCES tabela ( col )`). FKs **compostas** não viram
`Ref:` no DBML / aresta no canvas.

Por isso, no SQL atual, as relações de chave composta
(`item -> sequencia`, `item_msg -> item`, `liberacao/ocorrencia/anexo/ptu -> sequencia`)
usam um **workaround**: o `CONSTRAINT` composto fica correto no DDL (documentação),
mas a aresta no diagrama é desenhada por linhas `-- @fk: col -> tabela.col`, uma por
coluna de junção.

## Objetivo

Fazer o importador mapear **todas** as FKs declaradas via `CONSTRAINT ... FOREIGN KEY`,
incluindo as **compostas**, eliminando a necessidade do workaround `@fk` por coluna.

## Comportamento desejado

### Parsing de FK composta
- Reconhecer `FOREIGN KEY (a, b, ...) REFERENCES schema.tabela (x, y, ...)` com N colunas.
- Aceitar prefixo opcional `CONSTRAINT <nome>` (já ignorado hoje).
- Tolerar quebras de linha entre `FOREIGN KEY (...)` e `REFERENCES ...` (o SQL gerado
  quebra linha antes de `REFERENCES`).
- Aceitar aspas/crase nas colunas e nome qualificado `schema.tabela`.

### Geração de `Ref:` no DBML
- Para FK composta de N colunas, emparelhar posicionalmente origem[i] -> destino[i] e
  gerar **N refs** (uma por par) — coerente com o modelo atual de `Ref:` por coluna.
- Alternativa futura (maior esforço): suportar `Ref` composto nativo no DSL
  (`Ref: t.(a,b) > u.(x,y)`) e no canvas. Fora de escopo desta v7.

### Validação
- Erro claro no painel de Problemas quando o nº de colunas de origem != destino.
- Dedupe: não duplicar ref quando a mesma relação vier por `CONSTRAINT` e por `@fk`.

## Status

Implementado em `server/sqlImport.ts`, `server/model.ts`, `server/routes.ts`, `src/App.tsx`.

## Alterações previstas

- `server/sqlImport.ts`
  - `extractForeignKeysFromStmt`: trocar o regex de coluna única por um que capture a
    lista interna dos dois parênteses e faça split por vírgula; gerar um `Ref` por par
    de colunas. Manter o caminho `REFERENCES` inline (coluna única) como está.
  - Garantir tolerância a `\s`/quebra de linha entre `FOREIGN KEY (...)` e `REFERENCES`.
- `server/__tests__/sqlImport.test.ts`
  - Casos: FK simples nomeada; FK composta de 2 e 3 colunas; FK com quebra de linha;
    erro de aridade (origem != destino); dedupe `CONSTRAINT` + `@fk`.
- Após implementar: remover os `-- @fk:` redundantes do `tmp/autorizacao.sql`
  (item, item_msg, liberacao, ocorrencia, anexo, sequencia_ptu) e validar que as
  arestas continuam aparecendo no canvas a partir só do `CONSTRAINT`.

## Critérios de aceite

- AC1: Importar `tmp/autorizacao.sql` **sem** as linhas `@fk` desenha todas as arestas
  de chave composta (2 por seq, 3 por item_msg).
- AC2: FK simples nomeada (`fk_fato_autorizacao_situacao`) continua virando `Ref:`.
- AC3: Aridade divergente reporta problema, não quebra o import inteiro.
- AC4: Nenhuma aresta duplicada quando coexistirem `CONSTRAINT` composto e `@fk`.

## Fora de escopo

- `Ref` composto nativo (uma única aresta para a chave inteira).
- Geração de FK composta nos exports (DDL/dbt/erwin) — avaliar em spec posterior.
