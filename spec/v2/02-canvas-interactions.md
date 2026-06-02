# Spec v2 — Interações no canvas (hover, crow's foot, drag-to-create)

> Como o diagrama responde ao mouse e como o usuário cria relações arrastando.
> Visão geral: [`00-overview`](./00-overview.md).

## 1. Composição de hooks (padrão Structura)

`Canvas.tsx` deixa de ser monolítico; lógica vai para `src/canvas/hooks/`:
- `useCanvasModel(parsed, positions)` — deriva `nodes`/`edges` do React Flow.
- `useHoverHighlight()` — estado de hover + classes de destaque/esmaecimento.
- `useDragToCreate(onAppendRef)` — handler `onConnect` → escreve `Ref`.

Estado efêmero (hovered, etc.) no store Zustand `src/store/interaction.ts`.

## 2. Hover-highlight

- `onNodeMouseEnter(node)` define `hoveredTableId`; `onNodeMouseLeave` limpa.
- Com hover ativo:
  - Arestas conectadas à tabela: classe `edge--highlight` (cor `--brand-green`,
    `strokeWidth` maior, `animated`).
  - Tabelas vizinhas (origem/destino dessas arestas): classe `node--related`.
  - Demais nós e arestas: classe `--dimmed` (opacidade reduzida).
- Implementado por classes/estilos derivados em `useCanvasModel` a partir de
  `hoveredTableId` (sem recriar nós).

### AC
- **AC-HL-1**: Passar o mouse numa tabela aplica `edge--highlight` exatamente às
  arestas incidentes e esmaece as demais; sair limpa tudo.

## 3. Crow's foot (cardinalidade) — `src/canvas/RelationEdge.tsx`

- Edge customizada registrada em `edgeTypes`.
- A `RefView` passa a carregar a cardinalidade de cada ponta
  (`fromRel`/`toRel` ∈ `*` | `1`) derivada de `endpoints.relation` no `parse.ts`.
- Marcadores SVG nas pontas:
  - `*` (muitos) → **pé-de-galinha**.
  - `1` (um) → **barra única**.
  - 1:1 = barra/barra; n:1 = pé-de-galinha/barra; n:n = pé-de-galinha/pé-de-galinha.
- Caminho ortogonal (smoothstep) com a cor padrão `--brand-navy`; em hover usa a
  classe de highlight (§2).

### AC
- **AC-CF-1**: `posts.user_id > users.id` renderiza pé-de-galinha no lado `posts` e
  barra no lado `users`.

## 4. Drag-to-create relações

Objetivo: arrastar de uma **coluna** para outra cria uma `Ref` no DBML.

- `TableNode` ganha, por linha de coluna, um `Handle` `source` (direita) e um
  `target` (esquerda), com `id = nome_da_coluna`. Ocultos por padrão; revelados no
  hover da tabela (CSS) para não poluir.
- `onConnect({ source, target, sourceHandle, targetHandle })`:
  - `source`/`target` = ids de nós (`schema.tabela`); handles = nomes de coluna.
  - Monta `Ref: <sourceTable>.<sourceCol> > <targetTable>.<targetCol>` (n:1 por
    padrão; o lado arrastado é a FK / "muitos").
  - Chama `edit.appendRef()` (ver [`03-editing`](./03-editing.md) §Edit) que insere a
    linha na seção de Refs do texto; re-parse desenha a aresta.
- **Validações** (não escreve em caso inválido; status informa):
  - Ignora self-loop na mesma coluna.
  - Ignora duplicata (mesma origem→destino já existente).
  - Usa `dbmlIdent()` para nomes com hífen/espaço.

### AC
- **AC-DC-1**: Conectar `pedido.cliente_id` → `cliente.id` adiciona
  `Ref: ...pedido.cliente_id > ...cliente.id` ao editor e cria a aresta.
- **AC-DC-2**: Repetir a mesma conexão não duplica a Ref.

## 5. Testes

- Unidade: `useDragToCreate`/`edit.appendRef` (round-trip re-parseável; duplicata).
- Headless (playwright): hover aplica `edge--highlight`; disparar `onConnect`
  (programático) cria a Ref no texto e a aresta; sem erros de console.
