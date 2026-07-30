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

Marcar uma classificação sintética em um módulo vale pelos descendentes: o
lançamento fica nas folhas, e a hierarquia é seguida por `totalizaEm`, não pelo
prefixo do código (no ERP `3.1.1.3` totaliza em `3.1.2`, apesar do código).

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
