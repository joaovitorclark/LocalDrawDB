# v11-02 — Corrigir Export DDL

## Objetivo

Export DDL (e demais rotas de export) deve aceitar DBML com blocos custom (`LayerGroup`, `Lineage`, `LineageFields`, `Records`).

## A. Parse alinhado frontend/servidor

1. Módulo `src/dsl/dbmlClean.ts` com `cleanDbml()` — strip de blocos custom antes do `@dbml/core`
2. Rotas em `server/routes.ts` usam `dbmlToModel` que limpa internamente
3. `Lineage` / `LineageFields` ignorados no clean

## B. Erros legíveis na UI

1. `src/api.ts`: em `!res.ok`, ler JSON `{ error }` e incluir na mensagem
2. Teste `server/__tests__/exportDdl.test.ts` com DBML lakehouse → 200

## Critérios de aceite

- AC1: Export DDL com projeto lakehouse → `Gerado: data/output/spark/...`
- AC2: Erro de parse mostra mensagem do servidor na toolbar
