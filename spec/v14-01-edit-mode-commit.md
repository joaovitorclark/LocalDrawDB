# v14-01 — Modo de edição seguro (reconciliação no commit)

**Ciclo:** v14 · **Base de:** [v14-02 rolename](v14-02-rolename-propagation.md)
**Backlog:** [02-modo-edicao-dbml](backlog/02-modo-edicao-dbml.md)

## Problema

O sync atual replica renames a cada keystroke e causa 3 dores:

1. **Edita o que não devia** — casa tabelas por número de linha (`detectRenames` em
   `renameDetect.ts`), confundindo colunas que não deveriam mudar.
2. **Propaga no meio da digitação** — apago "preços", digito "v"; o debounce de 300ms
   dispara e renomeia tudo para "v" antes de eu terminar.
3. **Trava em scripts grandes** — `renameColumnAllRefs`/`renameTable` reescrevem o
   documento inteiro a cada keystroke; não há sinal de "terminou", e mexer na tabela
   durante isso é arriscado.

## Causa raiz

Inferir intenção de rename a partir de um texto em construção, a cada tecla, é
intrinsecamente instável. A correção é tornar o rename um evento de **commit** sobre
texto estável — não uma inferência contínua.

## Design

### Modelo de sessão de edição

- Mantém-se `committedDbml`: o último estado já reconciliado.
- Digitar atualiza **apenas** o buffer do editor e a visualização do canvas (render
  ao vivo da tabela em edição). **Nenhuma** propagação cruzada roda enquanto se digita.

### Gatilhos de commit

A reconciliação dispara quando o usuário "conclui" a edição:

- `blur` do editor (foco sai do CodeMirror);
- **Ctrl/Cmd+S**;
- selecionar **outra tabela** no canvas.

Nunca por pausa de digitação.

### Reconciliação

No commit:

1. `detected = detectRenames(committedDbml, buffer)` — agora sobre texto estável.
2. Se algum rename afeta referências (Refs, grupos, FKs filhas, records, indexes):
   exibe modal de confirmação (abaixo). Caso contrário, aplica e segue.
3. Atualiza `committedDbml = resultado`.

A detecção deve casar tabelas/colunas por **continuidade estrutural** (identidade do
bloco + sobreposição de colunas/assinatura), não só por número de linha, para não
tocar colunas que não mudaram. Reaproveitar/endurecer `detectRenames`.

### Modal de confirmação

```
┌──────────────────────────────────────┐
│ Renomear  preços → valores            │
│ Atualiza 4 referências (3 FKs, 1 Ref) │
│                                        │
│  [ Aplicar ]     [ Manter separado ]  │
└──────────────────────────────────────┘
```

- **Aplicar** → propaga (renomeia refs/FKs herdadas).
- **Manter separado** → não reescreve referências; para FKs filhas, registra rolename
  (ver [v14-02](v14-02-rolename-propagation.md)).

Se houver múltiplos renames numa mesma sessão, o modal os lista em lote.

### Performance e feedback

- Propagação roda **uma vez por commit**, não por keystroke.
- Estado visível durante a aplicação: `aplicando… → N refs atualizadas` na barra de
  status. Resolve o "não sei quando acabou".
- Enquanto se digita, a maquinaria pesada de rename não roda — o editor não trava.

## Critérios de aceite

- AC1: Apagar um nome de tabela/coluna e digitar um novo caractere a caractere **não**
  dispara nenhuma propagação até o commit.
- AC2: No commit, um rename que afeta referências mostra o modal antes de tocar o
  documento.
- AC3: "Aplicar" propaga corretamente; "Manter separado" não altera referências.
- AC4: Editar uma coluna não renomeia colunas vizinhas não relacionadas.
- AC5: Em script grande, a propagação é um evento único com feedback de início/fim;
  o editor permanece responsivo durante a digitação.
- AC6: Trocar de tabela no canvas com edição pendente dispara a reconciliação.

## Fora de escopo

- Representação e regra do rolename → [v14-02](v14-02-rolename-propagation.md).
- Redimensionamento do editor → backlog #4.

## Código relevante

- `src/App.tsx` — `handleDbmlChange` (~497), `mutateDbml` (~422), `setDbml`,
  `prevDbmlRef`, `renameTimer`.
- `src/dsl/renameDetect.ts` — `detectRenames` (endurecer casamento estrutural).
- `src/dsl/edit.ts` — `renameTable`, `renameColumnAllRefs`.
- `src/editor/Editor.tsx`, `src/editor/syncEditorCanvas.ts` — foco/blur, sync canvas.
