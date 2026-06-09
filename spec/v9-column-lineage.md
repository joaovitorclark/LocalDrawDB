# Spec v9 — Linhagem campo-a-campo (LineageFields)

## Problema

Linhagem tabela→tabela (`Lineage { }`) não captura renomeações ETL (`bronze.num_pedido` → `silver.cod_pedido`). O usuário precisa rastrear **qual coluna de origem alimenta qual coluna de destino**, com espaço para nota de regra e referência a script SQL/Python — sem poluir o canvas.

## Camadas de informação

| Camada | Exemplo | Onde |
|--------|---------|------|
| L1 Tabela | `bronze.autorizacao → silver.autorizacao` | Aresta `lineage` (tracejada roxa) |
| L2 Campo | `num_pedido → cod_pedido` | Painel `FieldLineagePanel` (default) |
| L3 Transformação | `note`, `ref` | Metadados no painel; futuro link para arquivo |

## Sintaxe DBML

```dbml
LineageFields {
  silver.pedido.cod_pedido < bronze.autorizacao.num_pedido [note: 'normaliza', ref: 'jobs/silver_pedido.py']
}
```

- Formato: `targetTable.targetColumn < sourceTable.sourceColumn`
- Settings opcionais: `note`, `ref` (strings entre aspas simples)
- Bloco separado de `Lineage { }` e de `Ref:`

## Fases

### Fase A — Parser + editor (implementada)
- `parseLineageFieldsBlock`, `addFieldLineageEntry`, `removeFieldLineageEntry`, `updateFieldLineageMeta`
- Validação em `validateModel.ts`

### Fase B — Painel de mapeamentos (implementada)
- `FieldLineagePanel`: lista mapeamentos da tabela destino selecionada
- Adicionar/remover par; editar `note` e `ref`

### Fase C — Arestas visuais opcionais (implementada)
- Toggle **"Mostrar linhagem de campos"** (desligado por default)
- Arestas `fieldLineage` só para tabela(s) selecionada(s) ou par focado no painel
- Handles `fl:s:col` / `fl:t:col` nas colunas quando toggle ativo

### Fase D — ETL tracking (futuro)
- `ref` clicável abre arquivo em `data/` ou preview
- Export para documentação de pipeline

## Critérios de aceite

- **AC1:** `LineageFields` persiste no DBML e sobrevive reload
- **AC2:** painel mostra mapeamentos da tabela selecionada como destino
- **AC3:** toggle de campo desligado = canvas sem arestas L2
- **AC4:** com toggle ligado e tabela selecionada, só arestas relevantes aparecem

## Anti-poluição

- Nunca desenhar todas as arestas L2 do modelo de uma vez
- Bronze com 200+ colunas: edição via painel, não arrastar 200 linhas no canvas
