# Spec: Exportação inteligente — PNG de alta qualidade e Documentação Markdown

> Objetivo: (A) tornar o export PNG mais legível e robusto, com fallback para
> múltiplas imagens por layer quando o diagrama for grande; (B) adicionar um botão
> "Gerar Documentação (Markdown)" que produz um documento didático, visual e
> detalhado do schema — entendível por pessoas não técnicas.

## Parte A — PNG inteligente

### Problema
`src/exportPng.ts` captura `.react-flow__viewport` com `html-to-image`
(`pixelRatio: 2`, `width/height = scrollWidth/scrollHeight`). Em diagramas grandes:
- estoura o limite de área/dimensão de canvas do browser (~16k px por lado /
  ~268M px de área no Chrome) → imagem em branco/preto ou cortada;
- não há controle de qualidade nem de fundo; preferência por imagem única não é garantida.

### Requisitos
1. **Imagem única de alta qualidade (preferência).** Calcular os limites reais do
   diagrama via React Flow em vez de depender de `scrollWidth/Height`.
2. **Qualidade adaptativa.** Escolher `pixelRatio` para maximizar nitidez **sem**
   ultrapassar limites seguros de canvas (alvo: maior lado ≤ ~12000px e área ≤
   ~100M px). Piso de qualidade configurável (ex.: 1.5x).
3. **Fallback por layer.** Se mesmo no piso a imagem única exceder o limite seguro,
   exportar **uma imagem por layer/área** (Bronze, Prata, Ouro e custom), cada uma
   em alta qualidade, mais um arquivo índice/manifesto.
4. **Configurações de export (PNG).** Pequeno popover/modal: escala (1x/2x/3x/auto),
   fundo (branco/transparente), e toggle "dividir diagramas grandes" + limiar.

### Design técnico
- **Bounds e enquadramento:** usar `useReactFlow()` + `getNodesBounds(nodes)` (RF v11)
  para o retângulo do diagrama; aplicar padding. Reaproveitar o padrão de
  `src/canvas/focusTableView.ts` para cálculo de bounds.
- **Captura por região (por layer):** para cada layer, usar a **visibilidade de
  layer já existente no store de interação** (`src/store/interaction.ts`) para deixar
  visível só a layer alvo, `fitView` nos bounds dessa layer, capturar o viewport e
  restaurar o estado anterior. Isso mantém cada captura dentro do limite de canvas e
  evita recortes geométricos sem sentido. (As posições/tamanhos vêm de `positions` e
  de `src/canvas/nodeMetrics.ts`.)
- **Refatorar `src/exportPng.ts`:**
  - `captureDiagramPng(opts)` → aceita `{ scale, background, bounds? }` e calcula
    `pixelRatio` adaptativo; mantém compat com o uso atual.
  - `captureByLayer(layers, opts)` → retorna `[{ layerId, dataUrl }]`.
  - `estimateOversize(bounds, scale)` → decide imagem única vs. split.
  - `downloadDataUrl` reutilizado; nomes `diagram.png` ou `diagram-{layer}.png`.
- **UI:** em `src/App.tsx` (`handlePng`) abrir o popover de configurações; o botão
  "Export PNG" continua na toolbar. Persistência server-side opcional em
  `POST /api/export/png` (já existe em `server/routes.ts`), estendido para múltiplos arquivos.

### Critérios de aceite (Parte A)
- Diagrama pequeno/médio: 1 PNG nítido, fundo escolhido, sem cortes.
- Diagrama grande: nunca gera imagem em branco/preta; cai para 1 PNG por layer + índice.
- Sem regressão no fluxo atual de "Export PNG".

## Parte B — Documentação em Markdown (server-side)

### Objetivo
Documento **didático**, organizado **por layer**, com **diagramas Mermaid** e
**resumos de linhagem**, para que pessoas não técnicas identifiquem os schemas e
entendam o relacionamento entre as camadas.

### Integração (segue o padrão dos outros exports)
- Novo formato `'doc-md'` em `ExportFormat` (`server/exportDispatch.ts`); rota em
  `runExport`; novo módulo `server/docExport.ts` (ou `server/ddl/markdownDoc.ts`).
- Reusar `dbmlToModel(dbml)` (`server/dbmlIo.ts`) → `Model` e `modelToMermaid(model)`
  (`server/ddl/mermaid.ts`) para o diagrama ER.
- Nova opção em `EXPORT_OPTIONS` (`src/api.ts`):
  `{ id: 'doc-md', label: 'Documentação (Markdown)', format: 'doc-md' }` →
  aparece automaticamente no `ExportMenu`.
- Saída: `data/output/documentacao.md` (arquivo único) via `writeOutput` (`server/files.ts`).

### Estrutura do documento (didática, por layer, com Mermaid)
1. **Capa / Visão geral** — nome do projeto, data de geração, contagens (tabelas,
   colunas, relacionamentos, layers). Parágrafo em linguagem simples explicando o
   que é o documento.
2. **Legenda / glossário visual** — explica em linguagem simples: 🔑 chave primária,
   🔗 chave estrangeira, cardinalidade (1:N, N:N), o que é uma **layer/camada**
   medallion (Bronze = bruto, Prata = tratado, Ouro = pronto p/ negócio) e o que é
   **linhagem** (de onde o dado vem e para onde vai).
3. **Mapa visual geral** — diagrama **Mermaid `erDiagram`** (via `modelToMermaid`)
   com todas as tabelas e relacionamentos; e um **`flowchart LR`** mostrando o fluxo
   entre camadas (Bronze → Prata → Ouro) agregado a partir da linhagem.
4. **Seção por camada** (Bronze, Prata, Ouro, custom) — para cada layer:
   - Papel da camada (texto padrão + nota da `LayerGroup`).
   - **Mini-diagrama Mermaid** só das tabelas da camada e suas relações internas.
   - Para cada tabela: descrição (`note`), **tabela markdown de colunas**
     (Coluna | Tipo | 🔑 | Obrigatório | Descrição), relacionamentos (FKs de/para),
     **"vem de"** (fontes de linhagem L1) e **"alimenta"** (alvos L1).
   - **Resumo de linhagem da camada**: "Esta camada consome de X e alimenta Y".
5. **Linhagem detalhada** —
   - **L1 (tabela→tabela):** por alvo, lista de fontes + `flowchart` Mermaid.
   - **L2 (coluna→coluna):** tabela markdown `alvo.coluna ← origem.coluna` com
     **nota de transformação** e **regra/ref**, agrupada por tabela alvo.
6. **Apêndice** — dados de exemplo (`records`) quando existirem; índice/TOC com âncoras.

### Diretrizes de redação
- Linguagem simples, frases curtas, emojis como ícones, âncoras/TOC navegável.
- Cada seção começa com um resumo de 1–2 frases antes dos detalhes técnicos.

### Critérios de aceite (Parte B)
- Botão "Documentação (Markdown)" no menu Exportar gera `documentacao.md`.
- Documento contém: visão geral, legenda, mapa Mermaid, seção por layer com
  resumos de linhagem, L1/L2 detalhadas.
- Tabelas sem layer aparecem numa seção "Sem camada".
- Renderiza corretamente em visualizadores Markdown com Mermaid (ex.: GitHub).

## Arquivos a tocar (implementação futura)
| Área | Arquivos |
|------|----------|
| PNG | `src/exportPng.ts`, `src/App.tsx`, `src/store/interaction.ts` (leitura de visibilidade), `src/canvas/nodeMetrics.ts` (reuso), `server/routes.ts` (multi-arquivo opcional) |
| MD | `server/exportDispatch.ts`, `server/docExport.ts` (novo), `server/ddl/mermaid.ts` (reuso), `server/dbmlIo.ts` (reuso), `src/api.ts`, `src/ExportMenu.tsx` (automático) |

## Verificação
- PNG: gerar com diagrama pequeno (1 imagem) e com fixture grande (split por layer);
  abrir os arquivos e confirmar nitidez e ausência de áreas pretas/branco.
- MD: rodar o export, abrir `data/output/documentacao.md` num visualizador com
  Mermaid e validar estrutura, diagramas e resumos de linhagem.
- Testes: adicionar testes de unidade para `docExport` (model fixture → markdown
  esperado) e para `estimateOversize`/`captureByLayer` (lógica pura).
