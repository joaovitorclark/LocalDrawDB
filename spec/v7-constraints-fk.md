# Spec v7 — Notação CONSTRAINT e mapeamento completo de FKs (inclusive compostas)

## Contexto

Modelos lakehouse com PK/FK em notação de CONSTRAINT nomeada, no padrão:

```sql
CONSTRAINT pk_stg_order_lines PRIMARY KEY (line_id),
CONSTRAINT fk_stg_order_lines_order FOREIGN KEY (order_id)
  REFERENCES raw.erp_orders (order_id)
```

Hoje o importador (`server/sqlImport.ts`) entende essa forma, mas com uma
**limitação histórica**: o regex de FK só capturava **uma coluna** por constraint
(`FOREIGN KEY ( col ) REFERENCES tabela ( col )`). FKs **compostas** não viravam
`Ref:` no DBML / aresta no canvas.

Por isso, em SQLs legados, relações de chave composta
podiam usar um **workaround**: o `CONSTRAINT` composto fica correto no DDL (documentação),
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
- Após implementar: validar com fixture composta (`demo_lakehouse_complex.sql`) que arestas
  de chave composta aparecem no canvas a partir só do `CONSTRAINT`.

## Critérios de aceite

- AC1: Importar SQL com FK composta **sem** linhas `@fk` redundantes desenha todas as arestas
  de chave composta.
- AC2: FK simples nomeada (ex.: `fk_fact_orders_customer`) continua virando `Ref:`.
- AC3: Aridade divergente reporta problema, não quebra o import inteiro.
- AC4: Nenhuma aresta duplicada quando coexistirem `CONSTRAINT` composto e `@fk`.

## Fora de escopo

- `Ref` composto nativo (uma única aresta para a chave inteira).
- Geração de FK composta nos exports (DDL/dbt/erwin) — avaliar em spec posterior.
