# Per-project ports — rodar projetos em portas isoladas (`npm run dev` multimodo)

> **Restrição inegociável:** `npm run dev` **sem flags** permanece idêntico ao de hoje
> (uma instância compartilhada, seletor de projeto na UI funcionando). Feature
> **aditiva**, suíte de testes verde, zero regressão no servidor/rotas atuais.

## Problema

Hoje a aplicação é multiprojeto numa **única instância**:

- `scripts/dev.mjs` aloca um par de portas (`allocateDevPorts()` em `scripts/devPorts.mjs`)
  e sobe **um** Fastify (`server/index.ts`, `PORT ?? 5174`) + **um** Vite. Grava
  `.localdrawdb-dev.json` com `{apiPort, webPort, root}`.
- O **projeto ativo é estado global**: `server/files.ts` `getActiveSlug()` (e
  `getActiveId()`) leem o `activeId` do registry compartilhado `projects.json`. A
  troca é feita pela UI (`src/ProjectSwitcher.tsx`) chamando
  `POST /api/projects/:id/activate` → `setActiveProject(id)`.

Consequências para quem trabalha com vários projetos:

1. **Não dá para ter dois projetos abertos ao mesmo tempo** em abas diferentes: as duas
   abas brigam pelo mesmo `activeId` global (trocar numa muda na outra).
2. **Não há como subir só o(s) projeto(s) que interessa(m)** numa porta dedicada para
   isolar e controlar o consumo de memória da máquina.
3. Subir "tudo" hoje nem é possível — só existe a instância única compartilhada.

## Objetivo

Um `npm run dev` **multimodo** que permite, à escolha do usuário a cada execução:

- rodar **um** projeto fixado numa porta dedicada;
- rodar **alguns** projetos, cada um na sua porta;
- rodar **todos** os projetos, cada um na sua porta;
- opcionalmente, servir o build estático (**`--preview`**) em vez do Vite para os
  projetos que são só de leitura — a alavanca real de economia de memória.

O isolamento vem de **fixar o projeto no processo** (variável de ambiente
`LOCALDRAWDB_PROJECT`), nunca no `projects.json` compartilhado.

## Comandos (UX)

```bash
npm run dev                          # INALTERADO: 1 instância compartilhada, seletor da UI ativo
npm run dev -- --project vendas      # 1 instância FIXADA no projeto "vendas"
npm run dev -- --projects vendas,rh  # 1 instância por slug, cada uma na sua porta
npm run dev -- --all                 # 1 instância por projeto do projects.json
npm run dev -- --all --preview       # idem, servindo o build (leve) em vez do Vite
```

- Slug inválido em `--project`/`--projects`: lista os slugs disponíveis e aborta com
  código ≠ 0 (não sobe nada).
- `--all` + `--project`/`--projects` juntos: erro de uso (mutuamente exclusivos).
- Saída do launcher em modo multi: tabela `projeto | web | api` + "Ctrl-C encerra todos".

## Metas / critérios de aceite

- **AC1 (default intacto):** `npm run dev` sem flags sobe exatamente uma instância
  compartilhada; `/api/meta.pinnedProject === null`; o seletor de projeto aparece e
  troca de projeto como hoje. Nenhum teste existente muda de comportamento.
- **AC2 (pin do servidor):** com `LOCALDRAWDB_PROJECT=<slug>` setado, `getActiveSlug()`
  retorna esse slug e `getActiveId()` o id correspondente, **ignorando** o `activeId`
  do registry. Vale para todas as rotas que resolvem o projeto ativo.
- **AC3 (isolamento de escrita):** com pin ativo, `POST /api/projects/:id/activate`
  **não** grava o `activeId` compartilhado (no-op idempotente que responde ok mas não
  persiste). Duas instâncias fixadas em slugs diferentes nunca interferem uma na outra.
- **AC4 (CRUD travado sob pin):** com pin ativo, criar/excluir/renomear/duplicar
  projeto retorna `409 Conflict` com mensagem clara ("instância fixada em <slug>").
  Ler (`GET /api/projects`, `/api/meta`, dados do projeto) continua funcionando.
- **AC5 (meta expõe o pin):** `GET /api/meta` passa a retornar
  `pinnedProject: <slug> | null` e `pinnedProjectId: <id> | null`.
- **AC6 (frontend fixado):** quando `pinnedProject` vem preenchido, o `ProjectSwitcher`
  vira um rótulo read-only ("📌 <nome do projeto>") — sem trocar/criar/excluir; um
  indicador no header mostra o projeto. Com `null`, UI idêntica à de hoje.
- **AC7 (launcher multi):** `--projects a,b` sobe dois pares (Fastify+Vite) com portas
  livres distintas, cada um com `LOCALDRAWDB_PROJECT` setado; `.localdrawdb-dev.json`
  passa a registrar um **array** de instâncias; `Ctrl-C` encerra todos e limpa o arquivo.
- **AC8 (preview leve):** `--preview` sobe, por projeto, **só** o Fastify servindo o
  `dist/` buildado (sem Vite). `vite build` roda uma vez antes (ou reaproveita `dist/`).
- **AC9:** suíte de testes verde; typecheck limpo; novos testes cobrem pin, guards e o
  parser de flags do launcher.

## Design técnico

### 1. Pin no servidor (`server/files.ts`)

Helper único, fonte da verdade do pin:

```ts
/** Slug fixado por processo, ou null. Validado contra o registry. */
export async function pinnedSlug(): Promise<string | null> {
  const slug = process.env.LOCALDRAWDB_PROJECT?.trim();
  if (!slug) return null;
  const reg = await readRegistry();
  if (!reg.projects.some((p) => p.slug === slug)) {
    throw new Error(`LOCALDRAWDB_PROJECT="${slug}" não existe no registry`);
  }
  return slug;
}
```

- `getActiveSlug()`: se `pinnedSlug()` → retorna-o; senão, comportamento atual.
- `getActiveId()`: se pin → retorna o `id` do projeto cujo `slug` casa o pin; senão atual.
- `setActiveProject(id)`: se pin → **no-op** (retorna sem gravar). Mantém a assinatura.

> O pin vive no `process.env`, nunca no `projects.json`. Cada instância grava apenas em
> `data/projects/<slug>/` (slugs distintos → sem corrida). O único arquivo mutável
> compartilhado é o registry, que instâncias fixadas **não** escrevem.

### 2. Guards nas rotas (`server/routes.ts`)

- `/api/meta`: adicionar `pinnedProject` e `pinnedProjectId` (de `pinnedSlug()` +
  lookup do id). Manter `root/dataDir/inputDir/port`.
- `/api/projects/:id/activate`: se pin ativo, responder `{ ok: true, pinned: <slug> }`
  **sem** chamar `setActiveProject` (ou confiar no no-op de §1; preferir guard explícito
  para clareza).
- `POST /api/projects`, `DELETE/PATCH /api/projects/:id`,
  `POST /api/projects/:id/duplicate`: se pin ativo → `reply.code(409).send({ error: ... })`.
  Helper `requireUnpinned(reply)` para não repetir.

### 3. Frontend (`src/api.ts`, `src/App.tsx`, `src/ProjectSwitcher.tsx`)

- `src/api.ts`: tipo do `/api/meta` ganha `pinnedProject?: string | null` e
  `pinnedProjectId?: string | null`.
- `src/App.tsx`: ao carregar meta, se `pinnedProject` → passar `pinned` para o
  `ProjectSwitcher` e suprimir as ações de troca/CRUD.
- `src/ProjectSwitcher.tsx`: nova prop opcional `pinnedLabel?: string`. Quando presente,
  renderiza um rótulo estático "📌 {pinnedLabel}" (sem dropdown, sem botões). Caminho
  atual inalterado quando ausente.

### 4. Launcher multimodo (`scripts/dev.mjs`, `scripts/devPorts.mjs`)

- **Parser de flags puro** (função exportável e testável):
  `parseDevArgs(argv) → { mode: 'shared'|'multi', slugs: string[]|null, preview: boolean }`.
  Valida exclusividade `--all` vs `--project(s)` e formato.
- **Resolução de slugs:** ler `projects.json` (reusar leitura do registry); para `--all`,
  todos; validar slugs de `--projects`; erro lista os disponíveis.
- **Spawn por slug:** para cada slug, `allocateDevPorts()` (par livre) e spawnar com env
  `{ ...process.env, LOCALDRAWDB_PROJECT: slug, PORT, VITE_PORT, API_PORT }`. Dev =
  `tsx watch server/index.ts` + `vite`. Preview = ver §5.
- **`.localdrawdb-dev.json`:** passa a ser `{ instances: [{ slug, apiPort, webPort }], root }`.
  Modo `shared` mantém retrocompat: array de 1 sem `slug` (ou `slug: null`).
- **Supervisão/shutdown:** um pai supervisiona N pares; `SIGINT/SIGTERM` → mata todos,
  remove o meta. Se um filho cai com código ≠ 0, derruba o conjunto (como hoje).

> Portas **dinâmicas** (livres) no v1 — robusto contra colisão. Portas determinísticas
> (base+offset por projeto) ficam como alternativa considerada, não adotada.

### 5. Modo `--preview` (`scripts/dev.mjs`, reuso de `server/index.ts`)

- Rodar `vite build` **uma vez** antes do fan-out (ou reusar `dist/` se já existir e for
  recente; flag interna para forçar rebuild fica fora do v1).
- Por slug, spawnar **apenas** o Fastify em modo produção
  (`NODE_ENV=production tsx server/index.ts`, que já serve `dist/` via `@fastify/static`)
  com `LOCALDRAWDB_PROJECT` e `PORT`. Sem Vite.
- Resultado: N servidores Node estáticos ≪ N Vites. É a economia de memória real.

## Plano em fases

| Fase | Entrega | Arquivos | Testável por |
|------|---------|----------|--------------|
| **F1** | Pin no servidor + guards + `/api/meta` | `server/files.ts`, `server/routes.ts` | Vitest (env + `LOCALDRAWDB_DATA_DIR` isolado) |
| **F2** | Launcher dev multimodo (`--project/--projects/--all`) | `scripts/dev.mjs`, `scripts/devPorts.mjs` | Vitest no parser; smoke de spawn |
| **F3** | Frontend fixado (meta → rótulo, esconder seletor) | `src/api.ts`, `src/App.tsx`, `src/ProjectSwitcher.tsx` | Browser-verify (Chrome do sistema) |
| **F4** | Modo `--preview` (build + Fastify estático por projeto) | `scripts/dev.mjs`, reuso `server/index.ts` | Smoke de spawn + verificação manual |

F1 é a fundação (sem ela nada isola). F2 entrega o valor central. F3 fecha a UX. F4 é a
alavanca de memória — pode ser adiada sem bloquear F1–F3.

## Testes (fixtures genéricas, sem dados proprietários)

- **F1:** com `LOCALDRAWDB_DATA_DIR` apontando para tmpdir com 2 projetos genéricos
  (`alpha`, `beta`): setar `LOCALDRAWDB_PROJECT=beta` e asserir `getActiveSlug()==='beta'`,
  `getActiveId()` = id de beta, `setActiveProject(idAlpha)` não muda o ativo, `/api/meta`
  retorna `pinnedProject:'beta'`, `activate`/create/delete respondem conforme AC3/AC4.
  Sem env, tudo igual ao comportamento atual (teste de não-regressão).
- **F2:** `parseDevArgs` (puro): cobre `[]`, `--project x`, `--projects x,y`, `--all`,
  `--all --project x` (erro), `--projects vazio` (erro), `--preview`. Smoke opcional:
  spawnar `--projects alpha,beta` em data dir isolado e checar dois `web` respondendo.
- **F3:** `scripts/verify-per-project-ports.mjs` (playwright-core + Chrome do sistema):
  subir instância com pin, abrir a web, asserir rótulo "📌" e ausência do dropdown de
  troca; zero erros de console.
- **F4:** smoke: `--all --preview` em data dir isolado sobe N Fastify estáticos servindo
  `dist/`; nenhum processo Vite no conjunto.

## Riscos & compat

- **Corrida no registry** → eliminada: pin vive no env; instâncias fixadas não gravam
  `activeId`; escrevem só em `data/projects/<slug>/`.
- **Default regredir** → `npm run dev` sem flags não seta `LOCALDRAWDB_PROJECT`; todos os
  caminhos novos são `if (pin) … else <comportamento atual>`. Coberto por teste de
  não-regressão (AC1).
- **`.localdrawdb-dev.json` (consumidores)** → virar array quebra quem lê o formato antigo;
  manter compat lendo ambos ou migrar os leitores no mesmo PR.
- **Pin com slug inexistente** → `pinnedSlug()` lança erro claro no boot (instância não
  sobe silenciosamente no projeto errado).
- **Memória em `--all` dev** → continua pesado por natureza (N Vites + N abas); a spec
  **não** promete o contrário. Economia vem de (a) rodar só o necessário e (b) `--preview`.

## Fora de escopo

- **Controle individual** (derrubar/subir uma instância sem mexer nas outras): exige um
  mini-manager/IPC. *Stretch goal* documentado; no v1, Ctrl-C e re-roda para mudar o conjunto.
- **Portas determinísticas** por projeto (URLs estáveis): alternativa considerada, não adotada.
- **Dashboard/painel** de instâncias rodando.
- Qualquer mudança no modelo de dados, DBML ou export.
