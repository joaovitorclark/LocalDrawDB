# External · EXT-00 — Protocolo de specs externas (mudanças no app)

> Objetivo: definir o que é uma "spec externa", como ela é escrita e como é
> entregue ao **agente especializado em alterar o app**. Decorre da constituição
> §2: **o modelo nunca altera o app**; toda mudança de app vira insumo aqui.

## Quando criar uma spec externa

Crie uma spec em `External/` sempre que uma necessidade da Fase 1/2 só for viável
**mudando o código** do LocalDrawDB (`LocalDrawDB/src/**`, `LocalDrawDB/server/**`,
testes, scripts). Exemplos: nova diretiva DBML, novo comportamento de export,
proxy cross-projeto, validador de nomenclatura.

**Não** crie spec externa para: editar input `.sql`, `projects.json`, YAMLs de
catálogo, reports — isso é manipulação de dados (fica em `Fase 1/`/`Fase 2/`).

## Fluxo de entrega

```
Necessidade na Fase 1/2
   │  não dá sem mudar o app?
   ├── não → resolve como manipulação de dados (Fase 1/Fase 2)
   └── sim → escreve External/EXT-XX-*.md
              │
              └── o humano envia manualmente a spec ao agente especializado do app
                    │
                    └── agente altera LocalDrawDB/ e entrega; voltamos a consumir como pré-requisito
```

- O autor humano é o **único canal** entre `External/` e o agente do app.
- Specs de fase **referenciam** a `EXT-XX` como pré-requisito; não embutem a
  implementação.

## Esqueleto obrigatório de uma spec externa

Pensada para ser **executável por um agente que não conhece este repositório**:

1. **Título + restrição inegociável** (ex.: "zero regressão", "round-trip", "suíte
   verde").
2. **Problema** — o que falta no app hoje, com **arquivos/funções reais**
   (caminho + símbolo).
3. **Metas / critérios de aceite** verificáveis.
4. **Design técnico** — arquivos a tocar, formato de dados, compat retroativa.
5. **Plano em fases** (se grande) com arquivos por fase.
6. **Testes** — fixtures genéricas, sem dados proprietários.
7. **Riscos & compat** — DBML/SQL legado intacto.

> Seguir o estilo das specs em `LocalDrawDB/spec/` (ex.: `multi-project-spec.md`,
> `dbt-integration-spec.md`): pt-BR, objetivo, com tabela "Arquivos a tocar".

## Princípios para o agente do app

- **Compat retroativa:** DBML/SQL existente continua parseando; campos novos são
  opcionais; round-trip preserva semântica.
- **Suíte verde:** manter os testes existentes passando; adicionar testes da feature.
- **Sem dados proprietários** em fixtures (usar `examples/`).
- **Mudança mínima:** só o necessário para a feature pedida.

## Índice de specs externas

| Spec | Feature | Demandada por |
|------|---------|---------------|
| `EXT-01-cross-project-reference-dbml.md` | Proxy DBML de referência cross-projeto (tabela = nome do projeto, campo = tabela) | `Fase 2/F2-03`, `F2-05` |
| `EXT-02-dbt-export-multiprojeto.md` | Export DBT com `ref()`/`source()` cross-projeto e consolidação multiprojeto | `Fase 2/F2-06` |

> Acrescente novas `EXT-XX` conforme as fases revelarem necessidades de app.

## Critérios de aceite (deste protocolo)

- **AC1:** Toda mudança de app pedida pelas fases existe como `EXT-XX` (e não como
  passo dentro de uma spec de fase).
- **AC2:** Cada `EXT-XX` é autocontida (um agente externo consegue executá-la sem
  contexto extra).
