# Spec v2 — Organize & Records

> Fundação de **texto**: um tokenizer de blocos DBML que habilita o botão Organize e
> o suporte a Records sem depender do re-export instável do `@dbml/core`.
> Visão geral: [`00-overview`](./00-overview.md).

## 1. Problema

- `@dbml/core` **não suporta `Records`**: ao colar o exemplo do dbdiagram, o
  `Parser.parse` lança erro e o canvas fica em branco.
- Não há um botão para padronizar a ordem do DBML (como o exemplo canônico do
  dbdiagram: Tables, depois Refs, depois Records).
- Re-serializar via `ModelExporter` é instável (perde comentários, falha em casos).

## 2. Tokenizer de blocos — `src/dsl/blocks.ts`

```ts
type BlockType =
  | 'project' | 'enum' | 'table' | 'tableGroup'
  | 'ref' | 'records' | 'comment' | 'blank';
type Block = { type: BlockType; name?: string; text: string };
function splitDbmlBlocks(src: string): Block[];
```

Regras de varredura (top-level):
- Reconhece por palavra-chave inicial (case-insensitive): `Project`, `Enum`, `Table`,
  `TableGroup`, `Ref`, `Records`/`records`.
- Blocos com `{ ... }` (Table, Enum, TableGroup, Records com chaves, Project): captura
  por **chaves balanceadas** (ignorando chaves dentro de strings `'...'`/`"..."` e
  comentários `// ...`).
- `Ref:` em **linha única** (sem chaves) é um bloco que termina no fim da linha.
  `Ref nome { ... }` é capturado por chaves.
- **Comentários** (`// ...`) imediatamente acima de um bloco são anexados ao `text`
  daquele bloco (para não se perderem ao reordenar). Comentários soltos viram blocos
  `comment`.
- Linhas em branco entre blocos viram `blank` (ou são normalizadas na saída).
- `name`: extraído quando trivial (`Table x`, `Records x(...)`) para testes/ord’.

Type guard `isBlockOfType(b, t)` (união discriminada, padrão Structura).

## 3. Strip de Records — `src/dsl/parse.ts`

- Nova função `extractRecords(src): { clean: string; records: string[] }` usa o
  tokenizer: remove blocos `records` do texto antes do `Parser.parse` e devolve os
  blocos crus.
- `parseDbml` chama `extractRecords` internamente → o canvas nunca quebra por Records.
- `ParseResult` ganha `records: ParsedRecords[]` (ver §5) para o painel de amostra.

## 4. Organize — `src/dsl/organize.ts`

```ts
function organize(src: string): string;
```
- Tokeniza e reemite **nesta ordem**, com uma linha em branco entre grupos:
  `project` → `enum` → `table` → `tableGroup` → `ref` → `records`.
- Dentro de cada grupo, **mantém a ordem relativa original** (estável).
- Comentários ficam grudados ao bloco a que pertencem.
- **Idempotente**: `organize(organize(x)) === organize(x)`.
- Exposto na toolbar como botão **Organize** (estilo primário/verde). Atualiza o
  editor e dispara o autosave existente.

## 5. Records: amostra — `src/dsl/records.ts` + `src/records/RecordsPanel.tsx`

Mini-parser (independente do `@dbml/core`):
```ts
type ParsedRecords = { table: string; columns: string[]; rows: string[][]; raw: string };
function parseRecords(block: string): ParsedRecords | null;
```
- Lê o cabeçalho `records <tabela>(col1, col2, ...) {` e cada linha de dados como
  CSV simples respeitando aspas (`'...'`) e vírgulas dentro de aspas.
- Sem `(colunas)` explícitas → `columns = []` (mostra índices).
- Tolerante a erro: linha inválida é ignorada, nunca lança.

`RecordsPanel`: drawer colapsável sob o canvas, oculto se não há records. Mostra,
por tabela, uma grade pequena (cabeçalho + linhas), com contagem (`N linhas`).

## 6. Critérios de aceite

- **AC-OR-1**: Colar o exemplo do dbdiagram (3 tabelas + refs + 3 `Records`) renderiza
  as tabelas/refs no canvas e lista as 3 amostras no painel — sem erro.
- **AC-OR-2**: `splitDbmlBlocks` separa corretamente tables/refs/records/comentários;
  comentário acima de uma tabela viaja junto dela ao organizar.
- **AC-OR-3**: `organize` produz a ordem tables→refs→records e é idempotente.
- **AC-OR-4**: `parseRecords` extrai colunas e linhas (incl. vírgula dentro de aspas).
- **AC-OR-5**: Texto que já era válido continua re-parseável após `organize`.

## 7. Testes (Vitest)

- `blocks.test.ts`: separação de tipos, chaves balanceadas, strings com `}`,
  comentários anexados, `Ref:` linha única vs `Ref { }`.
- `organize.test.ts`: ordem correta, estabilidade, idempotência, preservação de records.
- `records.test.ts`: header com/sem colunas, aspas com vírgula, linha inválida ignorada.
