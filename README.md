# Portal Orçamento

Planejamento orçamentário da King & Joe / AKR Brands. Front em React + Vite,
API em Node + Express sobre SQL Server.

> **Estado atual: API conectada; front ainda sobre mock.** A conexão com o
> SQL Server funciona e as rotas devolvem dados reais (contas, filiais, centros
> de custo, lançamentos). As telas, porém, ainda leem números gerados e gravam
> no `localStorage`. Não use como fonte de verdade contábil.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev      # front em http://localhost:5173 (com Fast Refresh)
npm run api      # API em http://localhost:3000 — precisa de .env
npm test         # testes da camada de dados
npm run build    # build de produção em dist/
```

O Vite encaminha `/api/*` para a API, então dev e produção usam a mesma origem.

## Conceitos

**Visão** — global, não pertence a nenhum plano. Define, para cada um dos 8
módulos do orçamento, quais contas o compõem. Ex.: `DRE 2025`.

**Plano** — escolhe **uma visão** na criação. Os módulos que o plano orça são os
módulos configurados naquela visão; um módulo sem conta selecionada não aparece.

**Configurações** — filiais e centros de custo. São **globais** do portal, não de
um plano: os dois vêm do ERP e valem para todos os planos.

```
Visões (global)
└── DRE 2025
    ├── Receita de vendas             4 contas
    ├── Receitas não operacionais     1 conta
    ├── Deduções de vendas            4 contas
    ├── Custos variáveis              —
    └── … (8 módulos fixos)

Configurações (global)
├── Filiais
└── Centro de Custos

Plano "Oficial"  → visão DRE 2025
└── Orçamentos    → só os módulos com conta na DRE 2025
                    → tabela mensal (planejado / realizado / ano anterior)
```

Os 8 módulos são fixos em [src/dados/modulos.js](src/dados/modulos.js):
2 de receita (verde) e 6 de despesa (vermelho).

## Estrutura

```
server/
├── index.js                 Express + rotas /api/*
├── sqlserver.js             pool mssql, query/queryOne/transaction
└── consultas.js             SELECTs do ERP (views confirmadas)

src/
├── main.jsx                 entrada; importa os CSS
├── App.jsx                  estado da aplicação e roteamento entre telas
├── dados/
│   ├── modulos.js           os 8 módulos fixos (+ parâmetro do mock)
│   ├── contas.js            plano de contas       ← provisório
│   ├── visao.js             modelo da visão
│   ├── configuracao.js      filiais e centros (global) ← trocar pelo banco
│   ├── seeds.js             dimensões e visão iniciais
│   ├── calendario.js        até que mês existe "realizado"
│   ├── mock.js              geradores determinísticos  ← trocar pelo banco
│   └── plano.js             modelo do plano, agregações e cálculos
├── lib/
│   ├── formato.js           moeda/percentual pt-BR e leitura de números
│   ├── persistencia.js      localStorage          ← trocar pela API
│   └── tema.js              tema claro/escuro
├── componentes/             UI reutilizável (Sidebar, Modal, Tabela, …)
├── telas/                   uma tela por rota
└── estilos/
    ├── tokens.css           tokens de cor claro/escuro (PADRAO §2)
    └── app.css              estilos dos componentes
```

### Como o plano guarda os valores

`plano.planejado` guarda **somente as edições manuais**, com chave
`modulo|filial|ano|mes`. Sem edição, o valor vem do gerador em
[src/dados/mock.js](src/dados/mock.js), usando o `base` do módulo e o `fator` da
filial.

Duas consequências desejadas:

- Uma filial criada pela tela nasce com `fator: 0` — planejado **e** realizado
  zerados, sem divergir entre os dois.
- Um módulo sem conta na visão devolve zeros em vez de número inventado.

## Banco

Copie [.env.example](.env.example) para `.env` e preencha as credenciais. O
`.env` está no `.gitignore` e nunca deve ser commitado. Use uma **conta de
serviço**, não uma conta pessoal, e não sysadmin.

Verificar:

```bash
npm run api
curl http://localhost:3000/api/health            # { ok: true, banco: "KINGEJOE" }
curl http://localhost:3000/api/contas
curl http://localhost:3000/api/filiais
curl http://localhost:3000/api/centros-de-custo
curl "http://localhost:3000/api/realizado?ano=2025"
```

### Objetos usados (KINGEJOE)

| Rota | Objeto | Observação |
|---|---|---|
| `/api/contas` | `dbo.CTB_VISAO` | filtrado por `VISAO_CONTABIL = 03` e `INDICA_CTRL_ORCAMENTO = 1` |
| `/api/filiais` | `dbo.FILIAIS` | `COD_FILIAL` + `FILIAL` |
| `/api/centros-de-custo` | `dbo.CTB_CENTRO_CUSTO` | só os com `INATIVA = 0` |
| `/api/realizado` | `dbo.CTB_LANCAMENTO` + `_ITEM` | agregado por conta, filial e mês |

`CTB_VISAO` é a árvore de classificação do Linx: `CLASSIFICACAO`,
`DESCR_CONTA` e `CLASSIFICACAO_TOTALIZA_EM` (o pai), o que permite montar a
hierarquia `3` → `3.1` → `3.1.1` → `3.1.1.1.02 COLEÇÃO`.

Colunas `char`/`varchar` do Linx vêm com espaço à direita — todo texto passa por
`RTRIM` em `server/consultas.js`.

### O que falta para o front consumir o banco

| Arquivo | O que substituir |
|---|---|
| `src/dados/contas.js` | `contasDoModulo()` passa a ler `/api/contas` |
| `src/dados/configuracao.js` | filiais e centros vêm de `/api/filiais` e `/api/centros-de-custo` |
| `src/dados/mock.js` | `gerarRealizado()` passa a ler `/api/realizado` |
| `src/lib/persistencia.js` | `localStorage` vira `fetch` da API |

**Pendência no realizado:** os itens de lançamento gravam `CONTA_CONTABIL`
(código de 6 dígitos, ex. `111101`), não a classificação da visão
(`3.1.1.1.02`). Falta confirmar em que tabela vive o de/para conta →
classificação — candidata: `dbo.CTB_CONTA_PLANO` — para agregar o realizado por
módulo do portal.

Regras que não podem ser afrouxadas (PADRAO §5): parâmetro sempre por bind,
`Date` tipado como `DateTime2(3)`, ERP só por `SELECT`, nunca alterar tabela do
ERP.

## Padrão visual

Segue o [PADRAO-PROJETOS-AKR.md](PADRAO-PROJETOS-AKR.md): sidebar preta de 256px
com a marca `AKR | BRANDS`, acento azul `#3f8ae0`, tokens de cor em `:root` com
tema claro e escuro, script de tema inline no `<head>` (evita o flash branco),
modais em `<dialog>` com layout flex-column e botão desabilitado com aparência
de desabilitado.

Duas divergências conscientes:

- **Sem card de usuário com "Sair"** no rodapé da sidebar. O portal ainda não
  tem autenticação; o rodapé identifica a empresa em vez de simular um login.
- **Stack React + Vite puro**, não TanStack Start + Tailwind.

## Testes

`npm test` roda a camada de dados com o runner nativo do Node (`node --test`),
sem dependência extra. A cobertura foca nos pontos onde um erro vira número
errado na tela: leitura de número pt-BR, corte temporal do realizado, módulo sem
contas, isolamento da edição por módulo/filial/ano, denominador das médias e
limpeza de chaves órfãs.

Os componentes não têm teste automatizado — foram verificados por renderização.

## Pendências conhecidas

- **O front ainda não consome a API** — as rotas funcionam, mas as telas leem o
  mock. É o próximo passo.
- **De/para conta contábil → classificação** não confirmado, o que bloqueia
  agregar o realizado por módulo (ver seção Banco).
- **Plano de contas do front ainda é provisório**: só receita (`3.1.1.x`) e
  dedução (`3.1.9.x`) em `src/dados/contas.js`. Custos variáveis, despesas
  operacionais, despesas com pessoal e outras despesas oferecem a lista de
  dedução até `/api/contas` ser ligado.
- Sem autenticação nem RBAC (o padrão exige enforcement no backend).
- Sem deploy: falta `deploy/setup.sh` e service systemd.
- `localStorage` tem limite de ~5 MB; a aplicação avisa na tela se a gravação
  falhar.
- **Chave de armazenamento em `:v3`.** A v2 (filiais e centros dentro do plano) é
  migrada na leitura, com união por id entre os planos. A v1 (canais e deduções)
  não tem equivalente e é ignorada.
