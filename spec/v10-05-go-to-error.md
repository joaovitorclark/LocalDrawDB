# Spec v10-05 — Ir para linha do erro

## Problema

Painel Problemas não leva à linha do erro no editor.

## Solução

### ModelIssue enriquecido

- `line?: number` (0-based no buffer do editor)
- Helpers: `lineOfTable`, `lineOfRef`, `lineOfColumn` via `blocks.ts`

### Parse errors

- `ParseResult.errorDetail?: { message, line }`
- Incluir em `modelIssues` no App

### Editor exposto

- `forwardRef` + `useImperativeHandle({ goToLine, goToColumn })`
- `ProblemsPanel` recebe `onGoToLine`

### UI

- Botão "Ir à linha" por issue; banner `.editor__error` clicável
- Expandir editor se colapsado

## Critérios de aceite

- **AC1:** Erro parse linha 42 → clique vai à linha 42.
- **AC2:** Aviso coluna inexistente → linha do Ref/coluna.
- **AC3:** Issue sem linha mantém foco canvas.

## Arquivos

`validateModel.ts`, `parse.ts`, `blocks.ts`, `Editor.tsx`, `ProblemsPanel.tsx`, `App.tsx`, `styles.css`
