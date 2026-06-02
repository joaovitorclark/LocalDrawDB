# Spec v2 — Edição (cor/grupos, propriedades de coluna, edição inline)

> Edição visual que **escreve no DBML** (ou em `canvas.json` quando é apresentação).
> Visão geral: [`00-overview`](./00-overview.md).

## 1. Camada de mutação de texto — `src/dsl/edit.ts`

Todas as edições estruturais produzem **novo DBML** ancorado no bloco da tabela
(localizado via `splitDbmlBlocks`, ver [`01`](./01-organize-records.md)). Princípio:
nomes de coluna são únicos dentro de uma tabela → localização robusta por nome.

```ts
function appendRef(src, fromTbl, fromCol, toTbl, toCol, kind = '>'): string;
function setColumnSetting(src, table, column, settings: ColSettings): string;
function renameColumn(src, table, oldName, newName): string;
function addColumn(src, table, name, type): string;
type ColSettings = { pk?: boolean; notNull?: boolean; note?: string; default?: string };
```

- `appendRef`: insere a linha `Ref: a.col > b.col` logo após o último `Ref` existente
  (ou ao fim, se não houver). Evita duplicata.
- `setColumnSetting`: reescreve o sufixo `[...]` da coluna preservando configs não
  tocadas; remove `[]` vazio.
- `renameColumn`/`addColumn`: editam apenas o bloco da tabela alvo.
- Todas devem produzir DBML **re-parseável** (testado).

## 2. Cor por tabela + grupos — apresentação em `canvas.json`

- **Cor**: menu no header do nó (paleta pequena: navy, verde, cinza, +N) grava
  `canvas.json.colors[tableId] = '#hex'`. `TableNode` aplica no header. Default = navy.
- **Persistência**: `canvas.json` ganha `colors: Record<tableId,string>` e
  `collapsedGroups: string[]` — `saveProject` (server) já persiste opaco.
- **Grupos visuais**: `TableGroup` do DBML vira uma **caixa** atrás dos nós do grupo
  (bounding box com rótulo). Colapsar/expandir alterna `collapsedGroups` (apenas
  visual; não altera o DBML).

### AC
- **AC-CL-1**: Trocar a cor de uma tabela altera só `canvas.json`; o DBML não muda.
- **AC-GR-1**: Tabelas num mesmo `TableGroup` aparecem dentro de uma caixa rotulada.

## 3. Painel de propriedades da coluna — `src/canvas/ColumnPanel.tsx`

- Selecionar uma coluna (clique) abre painel lateral com: nome (read-only aqui),
  tipo, checkboxes **pk** / **not null**, campos **note** e **default**.
- Alterações chamam `edit.setColumnSetting()` → atualiza o editor → re-parse.
- Estado de seleção no store Zustand (`selectedColumn`).

### AC
- **AC-CP-1**: Marcar "not null" numa coluna adiciona `[not null]` (ou compõe com
  `pk`) no DBML e o canvas reflete (ícone/realce), re-parseável.

## 4. Edição inline no canvas

- **Duplo-clique** no nome de uma coluna → input inline → `edit.renameColumn()`.
- **Duplo-clique** no header da tabela → renomeia a tabela (`edit` análogo; cuida das
  refs que citam o nome antigo — nesta rodada, renomear tabela é **opcional/stretch**
  se exigir reescrever refs; o MVP cobre renomear **coluna** e **adicionar coluna**).
- Botão "+" no rodapé do nó → `edit.addColumn(table, 'nova_coluna', 'string')`.

### AC
- **AC-IN-1**: Renomear `nome`→`nome_completo` por duplo-clique atualiza o DBML e o
  diagrama; refs que citam a coluna continuam válidas (ou são atualizadas).
- **AC-IN-2**: "+" adiciona uma coluna `string` editável.

## 5. Testes

- Unidade (`edit.test.ts`): cada função produz DBML re-parseável; `setColumnSetting`
  compõe/limpa `[]`; `appendRef` não duplica; `renameColumn` atinge só a tabela alvo.
- Headless: trocar cor persiste em `canvas.json` sem mexer no DBML; painel de coluna
  marca `not null`; duplo-clique renomeia coluna.
