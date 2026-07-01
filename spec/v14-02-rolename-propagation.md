# v14-02 — Rolename / propagação de nomes mãe→filha

**Ciclo:** v14 · **Depende de:** [v14-01 modo de edição](v14-01-edit-mode-commit.md)
**Backlog:** [01-rolename-fk-propagation](backlog/01-rolename-fk-propagation.md)

## Problema

Como no Erwin/ER-Studio: ao renomear a chave de uma tabela mãe, o nome correspondente
nas FKs filhas deve acompanhar — por padrão. Mas às vezes a filha precisa de um nome
próprio, e isso só pode acontecer com **anuência explícita** do editor (= virar um
rolename), nunca silenciosamente nem por engano.

### Padrão de mercado

Erwin/ER-Studio: a PK da mãe migra para a filha como nome da FK (herança). Em conflito,
o usuário escolhe **Unify / Rename / Rolename**; o rolename dá um nome próprio à FK e
**trava** o vínculo (renomear a mãe não muda mais a filha). Refs:
- https://bookshelf.erwin.com/bookshelf/public_html/2020R2/Content/User%20Guides/erwin%20Help/Control_Migrating_Foreign_Key_Unification.html
- https://docwiki.embarcadero.com/ERStudioDA/190/en/Creating_and_Editing_Relationships

## Design

### Representação no DBML — bloco `Rolenames`

Bloco dedicado (análogo a `LineageFields`), mantendo as linhas de coluna limpas:

```
Rolenames {
  pedidos.cliente_id < clientes.id
}
```

Semântica: *"`pedidos.cliente_id` é um rolename sobre a FK para `clientes.id` — não
renomeie automaticamente quando `clientes.id` mudar."* Sintaxe: `<filha.col> < <mãe.col>`.

### Parse / render

- Estender `splitDbmlBlocks` para reconhecer o tipo `rolenames` (hoje há table, ref,
  records, tableGroup, layerGroup, lineage, lineageFields).
- Parsear as entradas para um modelo `{ child: {table,col}, parent: {table,col} }[]`.
- Bloco preservado em round-trip (salvar/abrir). Ignorado na exportação DDL (não é SQL).

### Regra de propagação (no commit, ao renomear a chave da mãe)

Quando o commit ([v14-01](v14-01-edit-mode-commit.md)) detecta rename de uma coluna que
é chave referenciada (`parent.col_old → parent.col_new`):

1. Localiza todas as FKs filhas que referenciam `parent.col_old` — via blocos `Ref` e
   via inline `[ref: > parent.col_old]`.
2. Para cada FK filha:
   - **Listada em `Rolenames`** → intacta (travada). Atualiza só o alvo do ref para
     `parent.col_new`, mantendo o nome próprio da filha.
   - **Nome da filha == `col_old`** (herdado) → renomeia a coluna filha para `col_new`
     e atualiza o ref. Propagação padrão.
   - **Nome já difere e NÃO está em `Rolenames`** → divergência → entra no modal de
     confirmação como item "manter separado (virar rolename) ou alinhar?".

### Como nasce um rolename

- No modal de confirmação ([v14-01](v14-01-edit-mode-commit.md)), escolher **"Manter
  separado"** para uma filha → adiciona entrada ao bloco `Rolenames` (cria o bloco se
  não existir).
- A FK passa a ser tratada como travada nas próximas propagações.

### Escopo inicial

- FKs 1:N declaradas por bloco `Ref` e por inline `[ref: > parent.col]`.
- Chave da mãe = coluna PK / coluna referenciada pela FK.
- Fora deste ciclo: composite keys (multi-coluna), N:N, herança transitiva.

## Critérios de aceite

- AC1: Renomear `clientes.id → clientes.codigo` com FK filha herdada (mesmo nome)
  renomeia a FK filha junto e atualiza o ref, ao aplicar.
- AC2: FK filha listada em `Rolenames` não é renomeada; só o alvo do ref é atualizado.
- AC3: FK com nome divergente sem rolename é sinalizada no modal; "Manter separado"
  grava a entrada em `Rolenames` e não renomeia.
- AC4: O bloco `Rolenames` sobrevive a salvar/reabrir o projeto (round-trip).
- AC5: Exportação DDL não emite o bloco `Rolenames`.

## Fora de escopo

- Ação explícita "definir rolename" fora do fluxo de confirmação (futuro).
- Chaves compostas e relacionamentos N:N.

## Código relevante

- `src/dsl/blocks.ts` — `splitDbmlBlocks` (novo tipo `rolenames`).
- `src/dsl/parse.ts` — parse do bloco para o modelo.
- `src/dsl/edit.ts` — mutações: adicionar/remover entrada em `Rolenames`; estender
  `renameColumnAllRefs` para respeitar rolenames e atualizar alvos de ref.
- `src/App.tsx` — integração com o commit/modal da v14-01.
- Exportadores DDL (`server/` / export) — ignorar bloco `rolenames`.
