# Portal Orçamento

Planejamento orçamentário da King & Joe / AKR Brands. Front em React + Vite,
API em Node + Express sobre SQL Server.

> **Estado atual: sem dados falsos.** Plano de contas, filiais, centros de custo
> e realizado vêm do SQL Server. O que o portal guarda é só o que o usuário cria:
> visões e valores planejados — ainda no `localStorage`, sem tabela própria.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev      # sobe a API e o front juntos — é o comando do dia a dia
npm test         # testes da camada de dados
npm run build    # build de produção em dist/

# separados, se precisar:
npm run api      # só a API, em http://localhost:3000 (precisa de .env)
npm run dev:web  # só o front, em http://localhost:5173
```

O Vite encaminha `/api/*` para a API, então dev e produção usam a mesma origem.

`npm run dev` sobe os dois de propósito: com só o front no ar, o proxy responde
500 (`ECONNREFUSED`) e toda tela que depende do ERP fica vazia. A tela avisa o
motivo, mas o certo é não deixar acontecer.

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
│   ├── modulos.js           os 8 módulos fixos
│   ├── contas.js            índice do plano de contas vindo da API
│   ├── visao.js             modelo da visão
│   ├── realizado.js         índice do realizado vindo da API
│   ├── seeds.js             empresa e meses
│   ├── calendario.js        até que mês existe "realizado"
│   └── plano.js             modelo do plano, agregações e cálculos
├── lib/
│   ├── formato.js           moeda/percentual pt-BR e leitura de números
│   ├── api.js               cliente das rotas /api/*
│   ├── useErp.js            carga dos cadastros e do realizado
│   ├── persistencia.js      localStorage (visões e planejado)
│   └── tema.js              tema claro/escuro
├── componentes/             UI reutilizável (Sidebar, Modal, Tabela, …)
├── telas/                   uma tela por rota
└── estilos/
    ├── tokens.css           tokens de cor claro/escuro (PADRAO §2)
    └── app.css              estilos dos componentes
```

### O que é do ERP e o que é do portal

| Dado | Origem |
|---|---|
| Plano de contas (classificações) | `/api/contas` |
| Filiais | `/api/filiais` — somente leitura |
| Centros de custo | `/api/centros-de-custo` — somente leitura |
| Realizado e ano anterior | `/api/realizado` |
| Visões (módulo → contas) | portal, `localStorage` |
| Valores planejados | portal, `localStorage` |

`plano.planejado` tem chave `modulo|filial|ano|mes`. **Célula sem valor digitado é
zero**, não um número gerado — não existe planejamento que ninguém fez.

Cada módulo só aceita contas do seu `LX_GRUPO_CONTABIL`:

| Grupo | Módulos | Contas na visão 25 |
|---|---|---|
| `R` | Receita de vendas, Receitas não operacionais | 51 |
| `DV` | Deduções de vendas, Custos variáveis, Despesas variáveis | 127 |
| `DF` | Despesas operacionais, Outras despesas, Despesas com pessoal | 504 |

Pai e filho podem ter grupos diferentes — `3.1.2 (-) DEDUÇÕES` é `DF` e os filhos
são `DV`. Por isso o ancestral fora do grupo aparece na árvore como estrutura
(cinza, sem checkbox): sem ele a lista perde a hierarquia, e com ele selecionável
marcar o pai puxaria contas de outro módulo. A soma do realizado também respeita
o grupo, então marcar um pai nunca arrasta conta de fora.

Marcar um grupo vale pelos descendentes: o lançamento fica nas folhas. A
hierarquia é pelo prefixo do código, não por `totalizaEm`.

Receita é lida como crédito − débito; despesa inverte. As duas voltam positivas,
para a variação contra o planejado significar a mesma coisa nos dois casos.

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
| `/api/contas` | `dbo.CTB_VISAO` | visão 25, só classificações com ponto; devolve `LX_GRUPO_CONTABIL` |
| `/api/filiais` | `dbo.FILIAIS` | id = `COD_FILIAL`, nome = `FILIAL`; 25 registros |
| `/api/centros-de-custo` | `dbo.CTB_CENTRO_CUSTO` | nome = `DESC_CENTRO_CUSTO`; só `INATIVA = 0` (37 de 42) |
| `/api/realizado` | `dbo.CTB_LANCAMENTO` + `_ITEM` | agregado por conta, filial e mês |

A árvore se monta pelo PREFIXO do código: 3.1 -> 3.1.1 -> 3.1.1.01 -> 3.1.1.01.001.
`CLASSIFICACAO_TOTALIZA_EM` NAO serve para isso: indica para onde o valor
totaliza no DRE. A visão 25 tem 682 classificações com ponto (86 grupos, 596
folhas) e 8 raízes; onde falta um nível intermediário (existe 4.1.2.01 mas não
4.1.2), o nó sobe para o ancestral que existe.

Colunas `char`/`varchar` do Linx vêm com espaço à direita — todo texto passa por
`RTRIM` em `server/consultas.js`.

O id da filial é o `COD_FILIAL`, não o nome: é por ele que o realizado vem
agrupado e é ele que entra na chave do planejado. Nome muda, código não.

O realizado sai de `CTB_LANCAMENTO_ITEM`, que grava `CONTA_CONTABIL` (6 dígitos,
ex. `111101`). O de/para conta → classificação está em `dbo.CTB_PLANO_VISAO`, com
`OPERADOR` (+/−) e `PORCENTAGEM` de rateio — o join é feito na consulta.

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

- **Visões e valores planejados não têm tabela** — vivem no `localStorage` de
  cada navegador, não são compartilhados nem sofrem backup. É o próximo passo:
  tabelas `KING_PORTAL_*` no SQL Server (precisa de autorização para criar).
- Sem autenticação nem RBAC (o padrão exige enforcement no backend).
- Sem deploy: falta `deploy/setup.sh` e service systemd.
- `localStorage` tem limite de ~5 MB; a aplicação avisa na tela se a gravação
  falhar.
- **Chave de armazenamento em `:v4`.** Versões anteriores usavam ids fictícios
  (filial `akr`, conta `3.1.1.01.001`) que não existem no ERP; migrar deixaria
  chaves órfãs, então dados locais antigos são ignorados.
