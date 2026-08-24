---
name: Portal Orçamento
description: Ferramenta interna de orçamento e DRE configurável da AKR Brands, com precisão de planilha
colors:
  deep-ledger-black: "#0b0f0e"
  primary-action: "#10201b"
  primary-action-hover: "#000000"
  precision-blue: "#3f8ae0"
  precision-blue-soft: "#e6effc"
  canvas-bg: "#eef3f1"
  surface: "#ffffff"
  surface-soft: "#f6f9f8"
  surface-hover: "#edf2f0"
  surface-tint: "#f8faf9"
  surface-accent: "#e8f0fc"
  text: "#17231f"
  text-soft: "#405048"
  text-faint: "#66746d"
  muted: "#5a6862"
  accent-contraste: "#2569b4"
  border: "#d7e2de"
  border-strong: "#bdccc6"
  warning: "#b66a17"
  warning-soft: "#fff2dc"
  danger: "#b94a4a"
  danger-soft: "#fde9e9"
  danger-contraste: "#b94a4a"
  success: "#227c5b"
  success-soft: "#e5f5ed"
  success-contraste: "#227c5b"
  info: "#416b9b"
  info-soft: "#eaf1fa"
  disabled-bg: "#c9d3cf"
  disabled-fg: "#6c7a74"
  on-dark: "#ffffff"
typography:
  headline:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(24px, 2.4vw, 29px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
  emphasis:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.06em-0.09em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-action-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px 16px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  chip-receita:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  chip-despesa:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
---

# Design System: Portal Orçamento

## Overview

**Creative North Star: "The Spreadsheet Native"**

Portal Orçamento se comporta como uma planilha que ganhou estrutura, RBAC e
integração com ERP — não como um dashboard que aprendeu a mostrar números.
Números tabulares alinhados à direita (`font-variant-numeric: tabular-nums`),
células editáveis com alça de preenchimento estilo Excel
(`.alca-preenchimento`, arrasta e preenche como um `Ctrl+D`), e uma hierarquia
inteira construída em rótulos maiúsculos pequenos (11.5px, `letter-spacing`
largo) fazem o dado — não o cromo ao redor dele — ser o que o olho encontra
primeiro.

A sidebar preta fixa de 256px é a única superfície permanentemente escura do
sistema, nos dois temas — ela é "sala de comando" (identidade, navegação,
usuário), enquanto o conteúdo à direita é a "mesa de trabalho" que muda de
tema com o usuário. Um único azul (Precision Blue) carrega sozinho toda a cor
interativa do sistema: nada mais tem cor própria a menos que carregue
significado semântico (verde = receita/sucesso, vermelho = despesa/perigo,
âmbar = aviso).

**Key Characteristics:**
- Densidade de planilha: tabelas com `padding: 10px 14px`, texto de corpo em
  13px, cabeçalho pegajoso (`position: sticky`).
- Uma cor de ação (Precision Blue) para tudo que é interativo; cor semântica
  só onde o dado exige (receita/despesa/status).
- Flat em repouso — sombra aparece só quando algo flutua sobre o fundo
  (card, modal, painel), nunca como decoração de base.
- Transições curtas e utilitárias (0.14s–0.18s ease), nunca ornamentais.

## Colors

Paleta contida: um verde-neutro de fundo, um único azul de destaque, e cores
semânticas reservadas para o que elas significam — nunca decorativas.

### Primary
- **Deep Ledger Black** (`#0b0f0e`): fundo da sidebar. Teórico invariante de
  tema — é preto nos dois modos, porque a sidebar é identidade, não conteúdo
  (PADRAO §1). É a única cor que nunca muda.
- **Primary Action** (`#10201b` claro / `#4570a4` escuro): fundo do botão
  primário. Mesma família "quase-preto verde" de Deep Ledger Black no tema
  claro — mas **vira um azul da família Precision Blue no tema escuro**,
  porque quase-preto sobre fundo já escuro perderia contraste. Não é o
  próprio `--accent` (#6aa8f2): esse valor dá só 2.47:1 com texto branco em
  cima, abaixo do mínimo AA — o botão usa um tom mais escuro da mesma
  família, feito pra carregar texto claro.

### Accent
- **Precision Blue** (`#3f8ae0` claro / `#6aa8f2` escuro): a única cor
  interativa do sistema — link, anel de foco (`:focus-visible`), barra de
  3px do item de menu ativo, alça de preenchimento de célula. Se algo é
  clicável ou está em foco, é azul; se não é, não é.
- **Accent Contraste** (`#2569b4` claro / `#4570a4` escuro): a mesma família,
  escurecida especificamente pra texto branco sentar em cima (aba ativa,
  ação primária no tema escuro). Precision Blue puro só passa 4.5:1 com
  texto branco quando o texto é grande; em texto pequeno/negrito precisa
  desta variante.

### Neutral
- **Canvas** (`#eef3f1` claro / `#12171a` escuro): fundo da página.
- **Surface** (`#ffffff` claro / `#1a2125` escuro): cards, tabelas, modais.
- **Surface Soft/Hover/Tint**: variações de um tom para cabeçalho de tabela
  (`soft`), hover de linha (`hover`), e fundo de linha de média (`tint`).
- **Text / Text Soft / Text Faint / Muted**: hierarquia de leitura — corpo,
  metadado secundário, ícone terciário, rótulo de campo.
- **Border / Border Strong**: divisor padrão vs. borda de input/card que
  precisa de mais presença.

### Semantic
- **Success** (`#227c5b`) — receita, chip de status positivo.
- **Danger** (`#b94a4a`) — despesa, ação destrutiva, valor negativo em
  tabela (só o texto vira vermelho, o fundo da célula não muda).
- **Warning** (`#b66a17`) — aviso fixo no topo de tela/modal.
- **Info** (`#416b9b`) — nota informativa não-bloqueante.
- **Danger Contraste / Success Contraste**: mesma cor no claro; no escuro
  ganham um valor mais escuro que o próprio `--danger`/`--success` (que lá
  são clareados de propósito pra servir de texto contra fundo escuro).
  Usados só onde a cor vira fundo sólido com `--on-dark` em cima (botão
  perigo, estado "edita" da matriz de permissão) — mesma lógica do Accent
  Contraste, aplicada às duas cores semânticas que também viraram
  preenchimento em algum lugar do sistema.

### Sidebar-only tokens (fora do par claro/escuro)
Como a sidebar não segue o tema, ela tem sua própria escala de opacidade
sobre branco: `--sidebar-text` (72%), `--sidebar-muted` (60%), `--sidebar-faint`
(42%), `--sidebar-hover` (7%), `--sidebar-active` (14%), `--sidebar-line`
(9%) — todas `rgba(255,255,255,*)`, nunca hex sólido, porque escalam junto se
o preto de fundo mudar de tom.

### Named Rules
**The One Signal Rule.** Precision Blue é a única cor não-semântica do
sistema. Nenhum outro elemento decorativo recebe cor própria — se não é azul
interativo nem uma das quatro cores semânticas, é neutro.

**The Primary Flip Rule.** O botão primário muda de família de cor entre
temas (quase-preto → azul) porque sua função é "ação de maior peso visual
na tela", e essa função pede cores diferentes dependendo do fundo — a
identidade fixa (Deep Ledger Black) mora só na sidebar, nunca no botão.

**The Contrast-Safe Text Rule.** Texto branco/claro nunca senta direto sobre
`--accent` puro — usa `--accent-contraste` (mesma família, mais escura).
`--accent` é pra ser fundo *contra* um elemento neutro (borda, ícone, link),
não pra carregar texto em cima dele.

## Typography

**Body Font:** Inter (com `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
**Label/Mono Font:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace` (códigos de conta, fórmulas, badge de origem ERP)

**Character:** Uma família só, carregando tudo — hierarquia nasce de peso,
tamanho e letter-spacing, não de troca de fonte. É deliberadamente
"sem-serifa utilitária", nunca expressiva.

### Hierarchy
- **Headline** (700, `clamp(24px, 2.4vw, 29px)`, 1.15, -0.025em): título de
  página (`.cabecalho-pagina h1`). O único texto que usa `clamp()` — cresce
  com a viewport em vez de pular por breakpoint.
- **Hero** (700, 24px): título de boas-vindas do login
  (`.cartao-login__titulo h1`) — o primeiro texto que qualquer pessoa vê,
  agora do mesmo peso que um Headline de página em vez de menor que ela.
- **Title** (700, 17px, 1.2): `h2` de seção/módulo/DRE, cabeçalho de modal.
  Todo `h2` do sistema usa este único valor — não existe mais um segundo
  tamanho de `h2` (era 16px em modal, 17px no resto).
- **Emphasis** (600–700, 14.5px): nome de card (`.card-plano__texto strong`),
  linha de lista (`.linha-crud__nome strong`), subtítulo de bloco do DRE.
  Um degrau abaixo de Title — destaca dentro de um item, não anuncia uma
  seção nova.
- **Body** (400, 16px base / 13px em tabela ou controle denso, 1.45): texto
  corrido e conteúdo de célula. A tabela reduz pra 13px porque densidade
  vence lá.
- **Label** (700, 11.5–12px, 0.06em–0.09em, uppercase): rótulo de campo,
  cabeçalho de tabela, chip, badge de seção numerada. É o elemento tipográfico
  mais repetido do sistema — a "voz de estrutura".
- **Micro** (700, 10–11px): código de conta inline (`<code>`, 11px) e badge
  circular pequeno (contagem, sinal — 10px). Menor que Label porque não é
  metadado de estrutura, é anotação pontual dentro de uma linha.
- **Mono** (400, 13px): código de conta ERP, expressão de fórmula.
- **Wordmark** (800, 22px, 0.18em): "AKR | BRANDS" — mesmo valor na sidebar
  (`.marca`) e no login (`.login-marca`); é a mesma marca em duas telas, não
  pode ter dois tamanhos.

### Named Rules
**The Label-Is-Structure Rule.** Rótulo uppercase pequeno (11.5px,
letter-spacing largo) é o único recurso do sistema pra dizer "isto é
metadado, não conteúdo" — não existe uma segunda convenção pra isso.

**The One Value Per Job Rule.** A escala tinha oito valores entre 10px e
13.5px fazendo o mesmo trabalho sem distinção real (12 vs 12.5, 13 vs 13.5,
10 vs 10.5) e seis valores entre 14px e 17px fazendo o trabalho de "título
de card" vs "título de seção" sem separação clara. Cada papel tipográfico
tem exatamente um valor agora — uma exceção documentada (`.campo-login
input`/botão, 14px) porque é controle de formulário do login, não título,
e coincidir com Emphasis seria acidental, não intencional.

## Layout

Sidebar fixa de 256px + conteúdo à direita (`margin-left: var(--sidebar-width)`).
Conteúdo é centralizado com largura variável por tela — `min(1420px, calc(100% - 64px))`
no geral, 1180px em Planos (lista mais estreita), até 2200px na leitura do DRE
(`calc(100% - 32px)`, `max-width: 2200px`) porque tabelas de muitos meses
precisam de horizontal.

Densidade é alta por padrão: padding de tabela 10×14px, cards com
`min-height` só o suficiente pro conteúdo (82px em módulo, sem excesso).
Cabeçalho de tabela é sempre `position: sticky; top: 0`.

**Responsivo** (dois pontos de quebra observados):
- `900px`: sidebar deixa de ser fixa lateral e vira barra horizontal no topo
  (`position: static`, itens em `flex-wrap: row`); conteúdo perde a margem
  lateral reservada.
- `1180px`: telas com painel lateral de seleção (`.orcamento-layout`)
  reduzem a coluna de 240px pra caber mais painéis empilhados
  (`data-paineis="2"`/`"3"`).

Toda transição de entrada usa a mesma animação (`entrada`, 0.28s ease,
fade + translateY(7px)) — o conteúdo nunca aparece sem essa entrada.

## Elevation & Depth

Flat-by-default. Tabela, input, chip e nav-item não têm sombra nenhuma — a
única profundidade visual deles vem de cor de fundo (`surface-soft`,
`surface-hover`) e borda de 1px. Sombra é reservada para o que
**flutua sobre** o fundo da página: card, painel de lista, modal.

### Shadow Vocabulary
- **shadow-sm** (`0 1px 2px rgba(20,45,37,.05)`): elevação mínima, usada em
  `.card-modulo` — mal perceptível, só separa do fundo.
- **shadow-panel** (`0 12px 28px rgba(16,43,35,.07), 0 1px 2px rgba(16,43,35,.05)`):
  card de plano, lista CRUD, wrapper de tabela — o "peso padrão" de uma
  superfície de conteúdo.
- **shadow-md** (`0 18px 42px rgba(22,57,47,.13)`): reservada pro modal —
  o único elemento que se sobrepõe à página inteira (`<dialog>` +
  `::backdrop`), precisa da sombra mais forte do sistema.

### Motion

Uma curva só para chegada: `--ease-standard`
(`cubic-bezier(0.16, 1, 0.3, 1)`), aplicada onde algo entra ou aparece —
conteúdo de página, hover de card/botão, abertura de modal/drawer. Micro-
transição de feedback imediato (checkbox, chip, seta de disclosure) continua
em `ease` simples — desaceleração autoral é pra chegada, não pra resposta
instantânea. `<dialog>` (modal e drawer) e o backdrop abrem com
`@starting-style`/`allow-discrete`, sem JavaScript; card de grade
(`.grid-planos`, `.grid-modulos`) chega escalonado, tampado no 6º item pra
não atrasar quem tem grade grande. Todo botão tem `:active` (`scale(0.98)`,
`0.92` em ícone) — antes desta passada não existia nenhum estado de toque
real no sistema.

### Named Rules
**The Floating-Only Shadow Rule.** Se um elemento está no fluxo normal da
página (tabela, input, badge), ele não tem sombra. Sombra existe só para
sinalizar "isto está por cima de outra coisa".

**The Arrival-Only Curve Rule.** `--ease-standard` é reservado pra
transições de chegada (entrada, hover, abertura) — feedback instantâneo
(clique, marcação de checkbox) usa `ease` simples de propósito, porque
desaceleração autoral em uma resposta que precisa ser imediata lê como
atraso, não como polish.

## Shapes

Três raios, cada um ligado a uma escala de superfície: `--radius-sm` (6px)
em elementos pequenos e utilitários (botão de voltar, toggle de tema,
input inline de célula); `--radius-md` (8px) no padrão de botão e input;
`--radius-lg` (12px) em qualquer contêiner que carrega conteúdo (card,
modal, wrapper de tabela, lista CRUD). Pílula (`999px`) é reservada pra
chip, badge e avatar — nunca usada em contêiner retangular de conteúdo.

Bordas são sempre 1px sólida em `--border` ou `--border-strong` — nunca
dupla, tracejada (exceto o estado vazio, ver Components) ou com gradiente.

## Components

### Buttons
- **Shape:** `--radius-md` (8px), altura mínima 40px, padding `0 17px`.
- **Primary:** fundo `--primary`, texto `--on-dark`, peso 650. Hover sobe
  1px (`translateY(-1px)`) e escurece pro `--primary-hover`.
- **Secondary:** transparente com borda `--border-strong`; hover ganha
  `--surface-hover` de fundo, sem transformação.
- **Danger:** fundo `--danger`, texto `--on-dark`; hover só clareia
  (`filter: brightness(1.08)`), não sobe — reserva o movimento de elevação
  pra ações não-destrutivas.
- **Disabled:** todo botão vira `--disabled-bg`/`--disabled-fg`,
  `cursor: not-allowed`, sem transformação — nunca só opacidade reduzida.
- **Ícone-só** (`.botao-icone`): 34px quadrado, mesmas regras de hover/disabled.
- **Texto/link** (`.botao-texto`): sem fundo nem borda, cor muda no hover;
  variantes `--aviso` (âmbar) e `--perigo` (vermelho) têm cor de base própria,
  não só no hover — ação de risco precisa parecer arriscada em repouso.

### Chips
- **Style:** pílula (999px), 11.5px uppercase bold, sem borda (exceto
  `chip--origem`, que ganha borda + fonte mono porque marca dado vindo do
  ERP, não do portal).
- **Pares cor/fundo por papel:** receita = success, despesa = danger,
  edição = accent (não vermelho — poder de editar não é erro), leitura =
  neutro.

### Cards / Containers
- **Corner Style:** `--radius-lg` (12px).
- **Background:** `--surface`, borda `--border`.
- **Shadow Strategy:** `--shadow-panel` em repouso; `--shadow-sm` nos cards
  de módulo (mais numerosos, elevação mais discreta); hover sobe 2px e troca
  borda pra `--accent` — é o único lugar onde a cor de destaque aparece como
  borda inteira, não como acento pontual.
- **Internal Padding:** 14–18px.

### Inputs / Fields
- **Style:** borda `--border-strong`, fundo `--surface`, `--radius-md`,
  13.5px.
- **Focus:** anel de 2px em `--accent` (`:focus-visible`, outline padrão do
  sistema todo, não só de input).
- **Célula editável de tabela** (`.celula-editavel`) é o componente
  assinatura do sistema: hover e foco pintam a célula inteira de
  `--accent-soft` com `box-shadow: inset 0 0 0 1px/2px var(--accent)`, e
  revelam uma alça de 9px no canto (`.alca-preenchimento`) que arrasta pra
  preencher células vizinhas — mesmo gesto do Excel/Google Sheets
  (`Ctrl+D`), reconstruído em CSS puro.

### Navigation
- **Style:** item de 40px+ altura, `--radius-sm`, 15px bold, texto
  `--sidebar-text` (72% branco) em repouso.
- **Hover:** fundo `--sidebar-hover` (7% branco), texto sobe pra
  `--on-dark` (100%).
- **Active:** fundo `--sidebar-active` (14% branco) + barra de 3px à
  esquerda em `--sidebar-accent` (`box-shadow: inset 3px 0 0`) — nunca
  troca de ícone nem de peso de fonte pra marcar "ativo", só cor e a barra.
- **Mobile (`≤900px`):** sidebar vira barra horizontal no topo, itens
  encolhem pra largura do conteúdo (`width: auto`).

### Estado vazio
- Borda tracejada (`1px dashed var(--border-strong)`) — a única borda
  tracejada do sistema, reservada exclusivamente pra "não há nada aqui
  ainda". Ícone circular 48px em `--surface-accent`/`--accent`, texto curto
  centralizado.

## Do's and Don'ts

### Do:
- **Do** usar Precision Blue (`--accent`) só em elementos interativos ou em
  foco — link, botão primário no escuro, borda de card em hover, barra de
  nav ativa, alça de preenchimento.
- **Do** manter rótulos de estrutura (cabeçalho de tabela, label de campo,
  chip) em uppercase 11.5–12px bold com letter-spacing largo — é a única
  linguagem de "isto é metadado" no sistema.
- **Do** reservar sombra pra superfícies que flutuam sobre a página (card,
  modal, painel) — tabela, input e badge ficam sempre flat.
- **Do** manter os três raios ligados à escala de superfície: 6px em
  controle pequeno, 8px em botão/input, 12px em contêiner de conteúdo.

### Don't:
- **Don't** introduzir uma segunda cor de destaque — o sistema usa
  deliberadamente uma só (Precision Blue) pra tudo que é ação/foco.
- **Don't** aplicar sombra em elementos de fluxo normal (linha de tabela,
  input, chip) — sombra sinaliza "flutua", não "existe".
- **Don't** usar borda tracejada fora do estado vazio — é reservada pra
  "nada aqui ainda", não é um estilo de borda genérico.
- **Don't** desabilitar um botão só com opacidade — precisa do par
  `--disabled-bg`/`--disabled-fg` + `cursor: not-allowed` (PADRAO §4: tem
  que **parecer** desabilitado).
- **Don't** cravar hex direto num componente novo — criar um token em
  `tokens.css` quando faltar um caso, nunca cravar a cor solta (PADRAO §2).
