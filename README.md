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

**Visão** — global. Aponta para UMA visão contábil do Linx (ex.: `25 DRE
GERENCIAL`) e define, para cada módulo, quais contas o compõem **por filial** e,
quando o módulo usa, **por centro de custo**.

**Plano** — tem UM ano e escolhe uma visão. Os módulos que orça são os
configurados nela.

**Configurações** — filiais e centros de custo vêm do ERP. O portal só decide
quais filiais usar.

> O `Total` das telas de orçamento é o total das **filiais em uso**, não do ERP
> inteiro. Comparando com um relatório que não filtra filial, a diferença é
> exatamente o que ficou de fora — a tela avisa quando alguma filial com
> movimento no período está fora da configuração.

```
Visão "DRE 2026"  →  visão contábil 25 (DRE GERENCIAL)
├── Receita de vendas
│   ├── MEN HUB    → 3.1.1.01.001, 3.1.1.01.002
│   └── KING&JOE   → 3.1.1.01.001
└── Despesas operacionais            (usa centro de custo)
    └── KING&JOE   → 4.4.1.01, 4.4.1.02       contas da filial
        ├── 002 ADMINISTRAÇÃO → 4.4.1.01      subconjunto por centro
        └── 008 T.I           → 4.4.1.02

Plano "Orçamento 2026"  →  ano 2026 · visão DRE 2026
└── módulo → escolhe filial, centro e CONTA → lança o planejado mês a mês
```

O planejado é gravado por `modulo | filial | centro | conta | mes`. Só contas
analíticas (`CLASSIFICACAO_ANALITICA = 0`) recebem lançamento, então são as
únicas que a tela do plano oferece.

Os 8 módulos são fixos em [src/dados/modulos.js](src/dados/modulos.js) e cada um
só aceita contas do seu `LX_GRUPO_CONTABIL`: `R` nas receitas, `DV` em deduções,
custos e despesas variáveis, `DF` nas despesas fixas.

### Módulos em percentual

**Deduções de vendas** e **Custos variáveis** têm `percentual: true`: não se
digita o valor, digita-se o **percentual sobre uma conta de receita**. A tela
pede as duas dimensões à esquerda, como o Scoreplan pede produto/serviço e
dedução:

```
RECEITA (BASE DO %)              CONTAS DO MÓDULO
  Todas as receitas       11       Total do módulo        33
  3.1.1.01.001                     3.1.2.01.001
  VENDAS DE PRODUTOS - COLEÇÃO     (-) DEVOLUÇÃO DE VENDAS PRODUTOS
  1.850.000,00  ← planejado        3.1.2.01.010
  3.1.1.01.002                     ICMS S/ DEVOLUÇÃO DE VENDAS
  VENDAS DE PRODUTOS - SALDO       …
```

A tabela mostra as duas leituras lado a lado — `Planejado %` (editável) e
`Planejado R$` (calculado). Gravar exige receita **e** conta escolhidas: 2% de
devolução sobre coleção não é 2% sobre e-commerce, e um percentual único sobre a
receita inteira não saberia diferenciar.

A chave ganha um sexto segmento com a receita:

```
deducoes-vendas|000001||3.1.2.01.001|1|3.1.1.01.001
```

O que fica gravado é o percentual. É isso que faz o plano acompanhar a receita:
mudou a previsão de faturamento, a dedução recalcula sozinha.

A conversão é **por filial e por conta de receita**, nunca sobre a base
consolidada — aplicar uma base única daria o número errado justamente na tela
"Total", que é onde ninguém confere linha a linha. Nas linhas de Total o
percentual exibido é `valor ÷ base`, não a soma dos meses: somar taxas mensais
não dá taxa de nada.

### Digitação

A tabela do plano se comporta como planilha:

| Tecla | Efeito |
|---|---|
| clique, `Enter`, `F2` ou um dígito | abre a edição da célula |
| `Enter` / `Tab` | grava e desce (com `Shift`, sobe) |
| `↑` `↓` | gravam e movem |
| **arrastar a alça** do canto inferior direito | repete o valor na faixa arrastada, nos dois sentidos |
| `Ctrl+Enter` | grava o valor digitado deste mês **até dezembro** |
| `Ctrl+D` | copia o valor do mês de cima |
| `Esc` | cancela |

A alça é o quadradinho do canto, igual ao do Excel: aparece no hover da célula,
arrasta-se para cima ou para baixo e a faixa que vai ser preenchida fica marcada
enquanto o botão está pressionado. Arrastar além de dezembro preenche até
dezembro em vez de cancelar o gesto.

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

Seleção em cascata: marcar um grupo marca todas as contas abaixo dele, de forma
explícita — a visão guarda cada código. O grupo aparece meio-marcado quando parte
da subárvore está fora, e desmarcar uma conta isolada tira o valor dela do total.

O custo é não acompanhar o ERP sozinho: conta nova criada dentro de um grupo já
marcado NÃO entra na visão, alguém precisa voltar e marcá-la.

A soma NÃO expande descendentes — usa exatamente o que está marcado, recortado
pelo grupo contábil. Expandir ali faria desmarcar uma conta não surtir efeito.

A hierarquia é pelo prefixo do código, não por `totalizaEm`.

O sinal é da CONTA, não do módulo: `LX_GRUPO_CONTABIL = R` é receita (crédito −
débito), `DV`/`DF` é despesa (débito − crédito). As duas voltam positivas, para a
variação significar a mesma coisa nos dois casos.

O sinal sai de três camadas, nesta ordem:

1. **O que a visão define**, conta a conta — ganha de tudo.
2. **Correção conhecida** — conta que é receita mas está cadastrada como `DF` no
   ERP. Aplica sozinha, sem ninguém marcar nada. Hoje são `4.6.5.01`
   (INDENIZAÇÃO DE SEGUROS) e `4.6.5.02` (OUTRAS RECEITAS), em
   [src/dados/mapeamentoPadrao.js](src/dados/mapeamentoPadrao.js). Quando o
   cadastro do ERP for corrigido, é só apagar a entrada.
3. **`LX_GRUPO_CONTABIL` da conta.**

Isso importa porque um módulo de despesa contém contas de receita — "Outras
despesas" tem JUROS OBTIDOS e OUTRAS RECEITAS OPERACIONAIS. Conferido contra a
regra do Scoreplan nas 79 folhas do módulo: 79 de 79 iguais, incluindo as 19 que
ele lê como receita.

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
| `/api/visoes-contabeis` | `dbo.CTB_VISAO_CONTABIL` | id + nome das visões que têm estrutura |
| `/api/contas?visao=X` | `dbo.CTB_VISAO` | só classificações com ponto; devolve `LX_GRUPO_CONTABIL` |
| `/api/filiais` | `dbo.FILIAIS` | id = `COD_FILIAL`, nome = `FILIAL`; 25 registros |
| `/api/centros-de-custo` | `dbo.CTB_CENTRO_CUSTO` | nome = `DESC_CENTRO_CUSTO`; só `INATIVA = 0` (37 de 42) |
| `/api/realizado` | `CTB_LANCAMENTO` + `_ITEM` + `CTB_PLANO_VISAO` + `CTB_CENTRO_CUSTO_RATEIO_ITEM` | por classificação, filial, centro e mês |

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

**Rateio de centro de custo.** `RATEIO_CENTRO_CUSTO` no item de lançamento não é
um centro: é o código de um rateio, que `CTB_CENTRO_CUSTO_RATEIO_ITEM` abre em um
ou mais centros com percentual (o `R00001` abre em 36). Na base, 47 dos 89
rateios abrem em mais de um centro, e todos somam 100% — então o total não muda,
mas sem a expansão o detalhe por centro fica errado. O join é `LEFT`: rateio sem
item cadastrado mantém o lançamento em vez de sumir em silêncio.

**Encerramento do exercício fica de fora.** Em dezembro o Linx zera as contas de
resultado com lançamentos `LX_TIPO_LANCAMENTO` em `ELD, LAC, ELC, LAD` ("ENC. DO EXERCÍCIO" e apuração), do
tamanho do ano inteiro — R$ 115 mi em 2025. Sem excluir, dezembro inverte de
sinal e o total do ano some. Confirmado contra o Scoreplan: dez/2025 da MEN HUB
dá −978.568,61 com ELD e 177.347,66 sem, que é o valor certo.

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
