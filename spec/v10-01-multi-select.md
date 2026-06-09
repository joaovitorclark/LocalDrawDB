# Spec v10-01 — Multi-seleção de tabelas

## Problema

Cmd+clique no Mac não move várias tabelas de forma confiável; a seleção não aparece na UI.

## Solução

### 1. Sync bidirecional React Flow ↔ store

- Em `useCanvasNodes.ts`: ao montar nós `table`, setar `selected: selectedTableIds.includes(id)`.
- Em `Canvas.tsx`: `multiSelectionKeyCode` explícito `Meta`/`Control` via detecção de Mac.
- `selectTable()` / `focusTable()` só colapsam multi em clique explícito na lista de tabelas.

### 2. Barra de seleção (canto superior esquerdo)

- Componente `SelectionBar.tsx` sobreposto ao canvas.
- Visível quando `selectedTableIds.length >= 1`.
- Chips com nome curto; `×` por chip; botão "Limpar".
- Com 2+ itens: "N tabelas selecionadas".

### 3. Drag multi

- `onNodeDragStop` persiste todas as tabelas com `node.selected`.

## Critérios de aceite

- **AC1:** Mac Cmd+clique adiciona à seleção; Windows Ctrl+clique idem.
- **AC2:** Com 2 tabelas selecionadas, barra superior esquerda lista as duas.
- **AC3:** Arrastar uma selecionada move todas e salva posições.
- **AC4:** Box-select popula a barra.

## Arquivos

`Canvas.tsx`, `useCanvasNodes.ts`, `interaction.ts`, `SelectionBar.tsx`, `styles.css`, `LayersPanel.tsx`
