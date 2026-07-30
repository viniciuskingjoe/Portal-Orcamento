# Portal Orçamento

Planejamento orçamentário da King & Joe / AKR Brands. Front em React + Vite,
API em Node + Express sobre SQL Server.

> **Estado atual: front funcional sobre mock; API sem credencial.** As telas
> funcionam com números gerados e as edições ficam no `localStorage`. O backend
> está no ar mas ainda não tem `.env` nem os nomes das views do ERP. Não use
> como fonte de verdade contábil.

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

**Configurações do plano** — filiais e centros de custo. São dimensões do plano,
não da visão.

```
Visões (global)
└── DRE 2025
    ├── Receita de vendas             4 contas
    ├── Receitas não operacionais     1 conta
    ├── Deduções de vendas            4 contas
    ├── Custos variáveis              —
    └── … (8 módulos fixos)

Plano "Oficial"  → visão DRE 2025
├── Configurações → Filiais, Centro de Custos
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
└── consultas.js             SELECTs do ERP        ← views a confirmar

src/
├── main.jsx                 entrada; importa os CSS
├── App.jsx                  estado da aplicação e roteamento entre telas
├── dados/
│   ├── modulos.js           os 8 módulos fixos (+ parâmetro do mock)
│   ├── contas.js            plano de contas       ← provisório
│   ├── visao.js             modelo da visão
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

## Ligar no banco

O backend já sobe e responde. Falta:

1. **`.env`** — copie de [.env.example](.env.example) e preencha. Use uma
   **conta de serviço** do SQL Server, não uma conta pessoal, e não sysadmin.
   O `.env` está no `.gitignore` e nunca deve ser commitado.
2. **Nomes das views** — `DB_VIEW_CONTAS`, `DB_VIEW_FILIAIS`, `DB_VIEW_CENTROS`,
   `DB_VIEW_REALIZADO`. Sem elas a rota responde `503` dizendo o que falta.
3. **Colunas** — os SELECTs em `server/consultas.js` estão com a forma esperada,
   mas os nomes de coluna são suposições. Ajustar ao confirmar.

Verificar a conexão:

```bash
curl http://localhost:3000/api/health     # { ok: true, banco: "KINGEJOE", ... }
curl http://localhost:3000/api/contas
```

Depois disso, a troca do mock pelo banco é local:

| Arquivo | O que substituir |
|---|---|
| `src/dados/contas.js` | `contasDoModulo()` passa a ler `/api/contas` |
| `src/dados/mock.js` | `gerarRealizado()` passa a ler `/api/realizado` |
| `src/dados/seeds.js` | filiais e centros vêm de `/api/filiais` e `/api/centros-de-custo` |
| `src/lib/persistencia.js` | `localStorage` vira `fetch` da API |

Regras que não podem ser afrouxadas (PADRAO §5): parâmetro sempre por bind,
`Date` tipado como `DateTime2(3)`, ERP só por `SELECT` em view.

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

- **API sem `.env` e sem os nomes das views** — é o próximo passo.
- **Plano de contas incompleto**: só receita (`3.1.1.x`) e dedução (`3.1.9.x`).
  Custos variáveis, despesas operacionais, despesas com pessoal e outras
  despesas ainda oferecem a lista de dedução como provisório.
- Sem autenticação nem RBAC (o padrão exige enforcement no backend).
- Sem deploy: falta `deploy/setup.sh` e service systemd.
- `localStorage` tem limite de ~5 MB; a aplicação avisa na tela se a gravação
  falhar.
- **Dados locais da versão anterior foram descartados**: o modelo mudou (canais
  e deduções saíram, visões entraram) e a chave de armazenamento subiu para
  `:v2`.
