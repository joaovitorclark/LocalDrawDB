# v13-03 — Criar projeto na UI em modo pinned

## Objetivo

No modo pinned (instância fixada num projeto — pill read-only `📌 <nome>`, usado
pelo `dev`/`all` por padrão), permitir **criar** um projeto pela interface. Hoje o
`+ Novo projeto` só existe no `ProjectSwitcher` do modo shared.

## Decisão

**Criar + avisar**: a instância continua fixada no projeto atual (não troca). Após
criar, exibe aviso na barra de status com instrução para abrir o novo projeto.

## A. `ProjectSwitcher` (branch pinned)

1. No branch `if (pinnedLabel)`, adicionar um botão `+` ao lado do pill que dispara `onCreate` (prompt de nome, reusando o fluxo do `handleCreate`).
2. Botão pequeno, `title="Novo projeto"`, sem abrir dropdown.

## B. `App.handleCreateProject`

1. Detectar pinned via `pinnedProjectId`.
2. Pinned → **não** chamar `switchProject` após criar; em vez disso:
   - `await api.createProject(name)`
   - `refreshProjects()` (atualiza a lista)
   - `setStatus('Projeto "<nome>" criado. Reinicie o dev (./ldb) para abri-lo na própria porta.')`
3. Não-pinned → comportamento atual (cria e troca).

## Critérios de aceite

- AC1: no pill pinned, botão `+` cria o projeto e mostra o aviso de status; a instância permanece no projeto fixado.
- AC2: `data/projects/<slug>/` + entrada no registry criados.
- AC3: modo shared inalterado (cria e troca como hoje).

## Testes

- UI não tem testes de componente no repo (testes são de lógica). Extrair a mensagem de status pinned como função pura testável e verificar o fluxo manualmente via browser (`/run` / `/verify`).
