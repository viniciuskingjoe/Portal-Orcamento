# Padrão de projetos — AKR Brands / King&Joe

Referência de design, arquitetura e deploy usada nos portais internos (Fluxo
Fiscal / Portal-Envio-Documentos, Portal-Saldo, Portal-Modelagem). Uma nova
conversa deve ler este arquivo antes de começar, para que o novo projeto nasça
no mesmo trilho visual e operacional.

> Ao começar um projeto novo: copie este arquivo para a raiz do repositório e
> siga as seções. Não reinvente cores, layout de sidebar nem fluxo de deploy —
> eles já estão padronizados aqui.

---

## 1. Identidade visual

- **Marca:** wordmark textual `AKR | BRANDS` (não é imagem). "AKR" em peso
  extrabold, um divisor vertical fino, "BRANDS" em peso light com letter-spacing
  maior. Fica no topo da sidebar.
- **Nome do produto:** logo abaixo da marca, com um ícone quadrado e o nome do
  portal + uma linha de subtítulo (ex.: "Fluxo Fiscal" / "Envio de documentos").
- **Sidebar preta** (`#0b0f0e`) nos dois temas — é parte da identidade, não muda
  no modo escuro.
- **Acento azul** `#3f8ae0` (ações, foco, links). Tom mais claro `#6aa8f2` para
  destaque sobre a sidebar (item de menu ativo usa `box-shadow: inset 3px 0 0 #6aa8f2`).

Layout base: **sidebar fixa de 256px à esquerda + conteúdo à direita**. A
sidebar tem, de cima para baixo: marca → produto → navegação (com badges de
contagem) → (espaço flexível) → alternador de tema → card do usuário com botão
de sair. O card do usuário e o "Sair" ficam **no rodapé** da sidebar (`margin-top: auto`).

---

## 2. Tokens de cor (copiar como está)

Todas as cores são variáveis CSS no `:root`. **Nunca cravar hex nos componentes** —
sempre usar um token. Isso é o que permite o tema escuro funcionar. Quando faltar
um token para um caso novo, criar o token, não cravar a cor.

### Tema claro (`:root`)

```css
:root {
  --bg: #eef3f1;
  --surface: #ffffff;
  --surface-soft: #f6f9f8;
  --surface-hover: #edf2f0;
  --surface-tint: #f8faf9;
  --surface-accent: #e8f0fc;
  --text: #17231f;
  --text-soft: #405048;
  --text-faint: #7b8982;
  --muted: #68766f;
  --border: #d7e2de;
  --border-strong: #bdccc6;
  --primary: #10201b;         /* botão primário (quase preto) */
  --primary-hover: #000000;
  --accent: #3f8ae0;          /* azul da marca */
  --accent-soft: #e6effc;
  --warning: #b66a17;  --warning-soft: #fff2dc;
  --danger:  #b94a4a;  --danger-soft:  #fde9e9;
  --success: #227c5b;  --success-soft: #e5f5ed;
  --info:    #416b9b;  --info-soft:    #eaf1fa;
  --disabled-bg: #c9d3cf;  --disabled-fg: #6c7a74;
  --sidebar-bg: #0b0f0e;
  --on-dark: #ffffff;         /* texto sobre a sidebar escura — branco nos 2 temas */
  --overlay: rgba(12,27,22,.46);
  --shadow-sm: 0 1px 2px rgba(20,45,37,.05);
  --shadow-md: 0 18px 42px rgba(22,57,47,.13);
  --shadow-panel: 0 12px 28px rgba(16,43,35,.07), 0 1px 2px rgba(16,43,35,.05);
  --radius-sm: 6px;  --radius-md: 8px;  --radius-lg: 12px;
  --sidebar-width: 256px;
}
```

### Tema escuro (`:root[data-theme="dark"]`)

Só os tokens mudam — nenhuma regra de componente sabe do tema.

```css
:root[data-theme="dark"] {
  --bg: #12171a;
  --surface: #1a2125;
  --surface-soft: #202930;
  --surface-hover: #26313a;
  --surface-tint: #1d252a;
  --surface-accent: #1c2b3d;
  --text: #e6edf3;
  --text-soft: #c2ced6;
  --text-faint: #7d8d99;
  --muted: #93a3ae;
  --border: #2c3841;
  --border-strong: #3d4c58;
  --primary: #3f8ae0;         /* no escuro o "primário" vira o azul */
  --primary-hover: #5b9de8;
  --accent: #6aa8f2;
  --accent-soft: #1e2f45;
  --warning: #e0a25a;  --warning-soft: #3a2c17;
  --danger:  #e08585;  --danger-soft:  #3d2020;
  --success: #5fb98f;  --success-soft: #173024;
  --info:    #7aa8dd;  --info-soft:    #1b2836;
  --disabled-bg: #2c3841;  --disabled-fg: #6b7a86;
  --overlay: rgba(0,0,0,.6);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.4);
  --shadow-md: 0 18px 42px rgba(0,0,0,.5);
  --shadow-panel: 0 12px 28px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.3);
  color-scheme: dark;
}
:root[data-theme="dark"] body { background: var(--bg); }
```

> Portais em React/Tailwind (Portal-Saldo, Portal-Modelagem) usam os mesmos tons
> em oklch. O azul da marca é `oklch(0.63 0.14 254)`; o anel de foco/borda azul
> claro é `oklch(0.6 0.14 254)`.

---

## 3. Tema escuro — como implementar (sem piscar)

O tema é escolhido pelo usuário e guardado em `localStorage`. Na primeira visita,
segue `prefers-color-scheme`. **Aplicar por script inline no `<head>`, antes do
CSS pintar** — se aplicar no JS do fim do body, a tela pisca branca a cada load.

```html
<head>
  <link rel="stylesheet" href="styles.css" />
  <script>
    (function () {
      var salvo = localStorage.getItem('tema');
      var escuro = salvo ? salvo === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      if (escuro) document.documentElement.setAttribute('data-theme', 'dark');
    })();
  </script>
</head>
```

Alternador no rodapé da sidebar (sol/lua), grava em `localStorage` e troca o
atributo `data-theme` na raiz. O login também respeita o mesmo `localStorage`.

**Regra de ouro:** o que fica sobre a sidebar escura usa `--on-dark` (branco
sempre), **nunca** `--surface`. No tema escuro `--surface` é cinza-escuro — usá-lo
como cor de texto na sidebar faz o conteúdo sumir contra o próprio fundo.

---

## 4. Tipografia, espaçamento, componentes

- **Fonte:** `Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif`.
- **Corpo:** 16px. Títulos de página ~29px. Rótulos e metadados 12–13px.
- **Raios:** cards/inputs 8px (`--radius-md`), pílulas `999px`.
- **Cards/painéis:** fundo `--surface`, borda `--border`, `box-shadow: var(--shadow-panel)`.
- **Botão primário:** fundo `--primary`, texto `--on-dark`. Precisa de
  `:disabled` visível (cinza + `cursor: not-allowed`) — botão desabilitado tem
  que **parecer** desabilitado.
- **Chips de status:** pílula com um ponto (`::before`) da cor do status; par
  cor/fundo por token (`--success` / `--success-soft`, etc.). Status terminal/
  neutro usa tom cinza, não vermelho.
- **Modais (`<dialog>`):** layout flex-column — cabeçalho e rodapé fixos, corpo
  rolando no meio (`flex: 1; min-height: 0; overflow-y: auto`). **Não** usar
  `max-height: calc(100vh - Npx)` com número mágico: quebra quando o conteúdo cresce.
- **Toasts:** canto, empilháveis, auto-some. Bom para confirmação; **ruim** para
  bloqueio que o usuário precisa ver — nesse caso, aviso fixo no topo do modal/tela.
- **Estados vazios:** frase curta centralizada; idealmente com ícone.

---

## 5. Arquitetura (stack padrão dos portais Node)

Dois formatos coexistem:

- **App simples (Fluxo Fiscal):** Node ESM puro + Express, front em HTML/CSS/JS
  estático servido pelo próprio Express. Sem build. Ideal para portais internos.
- **App React (Portal-Saldo, Portal-Modelagem):** TanStack Start + Vite +
  Tailwind, tokens em oklch. Tem passo de build.

Convenções do app simples (que é o padrão recomendado para portais novos internos):

- **ESM** (`"type": "module"`). Node 22.5+ (a VM roda Node 24 via nvm).
- **Env por `node --env-file=.env`** (nativo), não `dotenv`. Em produção o
  systemd usa `EnvironmentFile`.
- **Cache-busting de assets:** o `/` injeta `?v=<mtime>` no `app.js`/`styles.css`.
  A SPA não recarrega o JS sozinha; sem isso o navegador serve JS velho e a tela
  quebra em silêncio. Combinar com `Cache-Control: no-cache` nos estáticos.
- **Sem dependências nativas** quando possível (evita build tools na VM).

### Banco: SQL Server (KINGEJOE) via `mssql`

- Pool único reaproveitado (`server/sqlserver.js`), com `query`, `queryOne`,
  `transaction`. Parâmetros **sempre por bind** (`request.input`), nunca
  concatenados.
- **Datas: tipar `Date` como `sql.DateTime2(3)` no bind.** O driver infere
  `DATETIME` (precisão ~3,3 ms) e arredonda — o que quebra qualquer coisa que
  compare o valor gravado com o lido (ex.: hash de auditoria).
- Ler dados do ERP (Linx) em **views** (`VW_..._`), somente `SELECT`; nunca
  alterar tabelas do ERP. Tabelas próprias em prefixo dedicado (ex.: `KING_PORTAL_*`).

### Auditoria append-only (quando o projeto exigir trilha imutável)

- Ledger com **hash encadeado** (`HASH_ANTERIOR` → `HASH`, SHA-256). Verificação
  recalcula a cadeia inteira.
- **Triggers `INSTEAD OF UPDATE/DELETE` com `THROW`** na tabela — só aceita INSERT.
  (`TRUNCATE` ainda apaga, por ser DDL: usar só para zerar antes de produção.)
- Leitura do último hash com `UPDLOCK, HOLDLOCK` — dois inserts simultâneos
  senão leem o mesmo hash anterior e quebram a cadeia.
- **Não pôr o SEQ (IDENTITY) no hash** — ele pula números em rollback e a
  verificação divergiria. A ordem já vem do encadeamento.
- **Hashear a string ISO gravada**, não a data lida de volta — precisão e fuso
  do driver deixam de influenciar.

### RBAC

- Papéis (ex.: administrador / fiscal / conferente) + status (pendente/ativo/inativo).
- **Enforcement no backend** (`requireRole`) — a UI só esconde, não protege.
- Gating de menu por papel via atributo, **mas** `[hidden]` sozinho não vence
  `.nav-item { display:flex }` (especificidade). Precisa de `.nav-item[hidden]
  { display:none }`.

---

## 6. Deploy na VM (padrão)

- **Local:** `/opt/<nome-do-app>`, dono `king`.
- **Node:** 24 via nvm (`/home/king/.nvm/versions/node/vXX/bin/node`).
- **Processo:** `systemd` com `EnvironmentFile=/opt/<app>/.env`. Redeploy usa
  `systemctl restart` (não `enable --now`, que não recarrega o código novo).
- **`deploy/setup.sh` idempotente:** clona/pull, `npm install`, cria `.env` a
  partir de `.env.example`, gera `SESSION_SECRET`, instala o service e o cron de
  backup, reinicia. Pode rodar de novo sem quebrar.
- **Scripts de deploy versionados com bit de execução** (`git update-index
  --chmod=+x`) — senão o `chmod +x` do setup gera diff local que trava o `git pull`.
- **Backup:** o banco fica coberto pela rotina do SQL Server (confirmar com TI
  que a instância está no plano). O `backup.sh` da VM cuida só do que vive no
  disco (uploads/anexos): `tar` + verificação + retenção; cron diário.
- **Publicação externa:** Cloudflare Tunnel → `localhost:<porta>` (passo manual
  no painel Zero Trust). O app roda atrás do túnel (`app.set('trust proxy', 1)`,
  cookie `secure` quando servido por HTTPS).

Fluxo de redeploy típico:

```bash
cd /opt/<app> && git pull && sudo systemctl restart <app>
# se mudou dependência:  ... && npm install && sudo systemctl restart <app>
# depois: hard-refresh no navegador (o ?v= já força o JS novo)
```

---

## 7. Segredos e segurança

- **`.env` nunca versionado.** Nada de IP interno, host de banco, credencial de
  AD ou nota de infra em arquivo commitado (nem em README/HANDOFF). Se precisar
  de nota de infra, mantê-la fora do git.
- **Conta de serviço** para o app acessar o banco — não a conta pessoal de um
  usuário (a senha vaza no `.env`, e o app cai quando a pessoa troca a senha).
  Se a trilha de auditoria importa, a conta do app **não** deve ser sysadmin
  (sysadmin ignora permissão e pode dropar os triggers).
- **Rate limit** no login (falhas por login+IP, bloqueio temporário) — as senhas
  costumam ser locais (scrypt) e o AD só confirma identidade no 1º acesso.

---

## 8. Armadilhas já pagas (não repetir)

| Sintoma | Causa | Correção |
|---|---|---|
| Tela pisca branca no load do tema | tema aplicado no JS do fim do body | script inline no `<head>` |
| Logo/menu somem no tema escuro | `#fff` virou `--surface` (cinza no escuro) | usar `--on-dark` sobre a sidebar |
| Item de menu oculto continua visível | `[hidden]` perde para `.nav-item{display:flex}` | `.nav-item[hidden]{display:none}` |
| Cadeia de auditoria "quebra" sozinha | driver grava `DATETIME` (arredonda) / fuso | bind `DateTime2(3)` + hashear a string ISO gravada |
| Data aparece 1 dia atrás | data pura (meia-noite UTC) formatada em -03:00 | trafegar como `YYYY-MM-DD` e renderizar sem fuso |
| `TRIM('0' FROM x)` come dígitos do fim | SQL Server 2019 corta dos 2 lados | `PATINDEX` para cortar só à esquerda |
| Botão desabilitado parece clicável | falta estilo `:disabled` | cinza + `cursor:not-allowed` |
| Modal corta conteúdo | `max-height: calc(100vh - Npx)` mágico | modal flex-column, corpo rolando |
| `git pull` trava na VM | bit +x gera diff local | versionar o bit com `update-index --chmod=+x` |
| Front novo + JS velho | SPA não recarrega o JS | `?v=<mtime>` nos assets + `no-cache` |

---

## 9. Checklist para um projeto novo

- [ ] Copiar os tokens de cor (seção 2) e o script de tema (seção 3).
- [ ] Sidebar 256px: marca AKR|BRANDS, produto, nav com badges, tema + usuário no rodapé.
- [ ] Botão primário com `:disabled` visível; modais flex-column.
- [ ] `.env.example` sem segredos; `.env` no `.gitignore`.
- [ ] `node --env-file=.env`; cache-busting `?v=` nos assets.
- [ ] Se usar SQL Server: pool `mssql`, bind sempre, `DateTime2(3)` para datas.
- [ ] RBAC no backend; `.nav-item[hidden]` no CSS.
- [ ] `deploy/setup.sh` idempotente + service systemd + backup cron; bit +x versionado.
- [ ] Testar os dois temas antes de subir.
