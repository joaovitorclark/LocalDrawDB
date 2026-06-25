# v13-04 — Fix: não consegue adicionar notas

## Sintoma

Ao digitar uma nota (de tabela ou coluna) no painel "Dados (amostra)"
(`RecordsPanel`), os caracteres/espaços somem e o cursor pula — é praticamente
impossível escrever a nota.

## Causa raiz

`NoteField` é um `<textarea>` **totalmente controlado** por `value={tableNote}`,
derivado do parse do `dbml`. A cada tecla, `onChange` chama `applyTableNote` →
`setTableOrRecordsNote(dbml, …)` → `onApply` → `setDbml`, que re-parseia o DBML e
recomputa o `value`. Como `upsertNoteLine` grava `note.trim()`, o espaço/sufixo
recém-digitado é descartado no round-trip; a atualização derivada também derruba
caracteres rápidos e reseta o cursor para o fim.

Arquivos: `src/records/RecordsPanel.tsx` (`NoteField`, `applyTableNote`,
`applyColumnNote`), `src/dsl/edit.ts` (`upsertNoteLine`).

## Correção

Desacoplar a digitação do round-trip do DBML: `NoteField` mantém **estado local
(rascunho)** enquanto editado e só comita no DBML **no blur** (e/ou debounce).

1. `NoteField`: `useState` inicializado de `value`; `onChange` atualiza só o estado local.
2. `onBlur` → chama `onChange(draft)` (commit) que aciona o `onApply`/`setDbml`.
3. Sincronizar o rascunho com `value` quando ele muda externamente (troca de tabela/coluna) **sem** sobrescrever enquanto o campo está focado.

## Critérios de aceite

- AC1: digitar "dimensão de clientes" (com espaços) no campo de nota mantém o texto e o cursor; nenhum caractere é descartado.
- AC2: ao sair do campo, a nota é persistida no DBML (`Note:` na Table ou no bloco `Records`).
- AC3: trocar a tabela selecionada carrega a nota correta no campo.
- AC4: nota de coluna funciona do mesmo modo.

## Testes (TDD)

- `systematic-debugging` primeiro: teste que reproduz a perda de caractere/espaço.
- Teste de lógica para `upsertNoteLine`/`setTableOrRecordsNote` preservando o texto comitado (incl. múltiplas palavras).
- Verificação manual da digitação no browser (`/verify`).
