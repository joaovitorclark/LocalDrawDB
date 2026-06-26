# v13-02 — CLI para criar projeto

## Objetivo

Criar um projeto pela linha de comando, reusando o `createProject()` canônico de
`server/files.ts` (mesmo padrão tsx do `ensureRegistry.ts`). Expor **duas**
superfícies: `./ldb new <nome>` e `npm run new -- <nome>`.

## A. Entry tsx + helper compartilhado

1. `scripts/createProject.ts` (rodado via tsx): lê `<nome>` de `process.argv[2]`, chama `createProject(nome)` (respeita `LOCALDRAWDB_DATA_DIR`), imprime `Projeto criado: <nome> (slug: <slug>)`. Sai 1 se o nome for vazio.
2. `scripts/registry.mjs` ganha `createProjectCli(name, dataDir?)` — spawn tsx do `createProject.ts`, stdio herdado, retorna status. DRY entre as duas superfícies.

## B. `./ldb new <nome>`

1. `scripts/dev.mjs`: **antes** do `parseDevArgs`, detectar o verbo `new` como `argv[0]`.
2. Se `new` sem nome → erro `Uso: ./ldb new <nome>` e exit 1.
3. Caso contrário, junta o resto dos args como nome, chama `createProjectCli`, e sai (não sobe servidor).

## C. `npm run new -- <nome>`

1. `scripts/newProject.mjs`: valida `<nome>` de `process.argv.slice(2)`, chama `createProjectCli`.
2. `package.json`: `"new": "node scripts/newProject.mjs"`.

## Critérios de aceite

- AC1: `./ldb new "Meu Projeto"` cria `data/projects/meu-projeto/` + entrada no registry e imprime o slug.
- AC2: `npm run new -- "Meu Projeto"` faz o mesmo.
- AC3: nome vazio → mensagem de uso e exit code ≠ 0; nenhuma pasta criada.
- AC4: slug colide → sufixo numérico (reuso do `uniqueSlug` existente).

## Testes (TDD)

- `scripts/__tests__/newProject.test.mjs`: parse de args (`new`/nome ausente → erro) e criação contra `dataDir` temporário (verifica pasta + `projects.json`).
- Reuso da cobertura existente de `createProject` em `server/__tests__/projects.test.ts`.
