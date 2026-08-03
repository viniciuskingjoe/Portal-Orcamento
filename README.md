# Portal Orçamento

Planejamento orçamentário da King & Joe / AKR Brands. Front em React + Vite,
API em Node + Express sobre SQL Server.

> **Sem dados falsos e sem estado local.** Plano de contas, filiais, centros de
> custo e realizado vêm do ERP; visões, planos e planejado ficam nas tabelas
> `KING_PORTAL_ORC_*`. Login por bind no Active Directory, permissão por usuário
> — ver [Acesso](#acesso).

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev        # sobe a API e o front juntos — é o comando do dia a dia
npm test           # testes da camada de dados (sem banco, sem rede)
npm run build      # build de produção em dist/

# separados, se precisar:
npm run api        # só a API, em http://localhost:3000 (precisa de .env)
npm run dev:web    # só o front, em http://localhost:5173
npm run integracao # roda contra o banco de verdade; ver Testes
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
    └── KING&JOE                              filial → centros → contas
        ├── 002 ADMINISTRAÇÃO → 4.4.1.01
        └── 008 T.I           → 4.4.1.02
        ═ contas da filial    → 4.4.1.01, 4.4.1.02    união, derivada

Plano "Orçamento 2026"  →  ano 2026 · visão DRE 2026
└── módulo → escolhe filial, centro e CONTA → lança o planejado mês a mês
```

Sem centro de custo, a filial escolhe as contas direto. **Com** centro a ordem é
filial → centros → contas de cada centro: marca-se quais centros a filial usa e
depois o que cada um orça. A lista da filial deixa de ser escolha e passa a ser
o consolidado — quem lança é o centro. Guardar a união em `contas`, em vez de
recalculá-la, mantém tela do plano, DRE e base do percentual lendo a filial sem
precisar saber que o módulo usa centro.

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
┌─ RECEITA (BASE DO %) ────────┐ ┌─ CONTAS DO MÓDULO ───────────┐
│ Todas as receitas         11 │ │ Total do módulo           33 │
│ 3.1.1.01.001                 │ │ 3.1.2.01.001                 │
│ VENDAS DE PRODUTOS - COLEÇÃO │ │ (-) DEVOLUÇÃO DE VENDAS      │
│ 1.850.000,00   ← planejado   │ │ 3.1.2.01.010                 │
│ 3.1.1.01.002                 │ │ ICMS S/ DEVOLUÇÃO DE VENDAS  │
│ VENDAS DE PRODUTOS - SALDO   │ │ …                            │
└──────────────────────────────┘ └──────────────────────────────┘
```

A tabela mostra as duas leituras lado a lado, e **as duas aceitam digitação**:
`Planejado %` e `Planejado R$`. Digitar em reais é lançar pelo outro lado — o que
fica gravado continua sendo o percentual (`valor ÷ base × 100`), para o plano
seguir acompanhando a receita. É o que o Scoreplan faz com as abas PERCENTUAL e
TOTAL, sem precisar trocar de aba.

Gravar exige receita **e** conta escolhidas: 2% de devolução sobre coleção não é
2% sobre e-commerce, e um percentual único sobre a receita inteira não saberia
diferenciar.

Há ainda a coluna **Realizado %**, que é `realizado ÷ receita REALIZADA do mês` —
não a planejada. É o que torna a coluna comparável com `Planejado %`: as duas
passam a ser fatia da receita do próprio período, e a diferença entre elas é
desvio de margem, não efeito de a receita ter vindo diferente do previsto.

A chave ganha um sexto segmento com a receita:

```
deducoes-vendas|000001||3.1.2.01.001|1|3.1.1.01.001
```

O que fica gravado é o percentual. É isso que faz o plano acompanhar a receita:
mudou a previsão de faturamento, a dedução recalcula sozinha.

O **realizado** segue o mesmo recorte, senão o planejado seria de uma fatia e a
coluna comparativa do bolo inteiro. Como o razão não diz de qual receita é uma
devolução, a atribuição vem do centro de custo — a regra do Scoreplan:

```sql
case when CRI.CENTRO_CUSTO = '020' then '31101004'   -- e-commerce
     else '31101001' end                             -- coleção
```

É grosseiro (devolução de bazar, saldo e mostruário entra como coleção, e as
outras receitas ficam sem realizado), mas é o que produz os números do Scoreplan.
Fica isolado em `RECEITA_DO_REALIZADO`, para sair daqui quando o ERP passar a
marcar a receita no lançamento. Em "Todas as receitas" não há filtro: o realizado
é o da conta contábil inteira, que dá o mesmo total sem risco de perder o
movimento de um centro que a visão não tenha configurado.

A conversão é **por filial e por conta de receita**, nunca sobre a base
consolidada — aplicar uma base única daria o número errado justamente na tela
"Total", que é onde ninguém confere linha a linha. Nas linhas de Total o
percentual exibido é `valor ÷ base`, não a soma dos meses: somar taxas mensais
não dá taxa de nada.

### DRE

Tela própria, ao lado da Visão geral (que segue sendo o lançador dos módulos).
O DRE não é um módulo que se orça — é onde os outros fecham —, então fica fora
da lista de módulos, na barra lateral e como último cartão da Visão geral.

Traz os 8 módulos na ordem em que compõem o exercício. Cada módulo entra **uma
vez**, com o sinal declarado, e cada subtotal é a soma acumulada de tudo acima
dele — mexer na ordem não exige manter lista de parcelas em dia.

```
(+) Receita de vendas
(-) Deduções de vendas
  = Receita líquida            ← base da análise vertical
(-) Custos variáveis
  = Margem bruta
(-) Despesas variáveis
  = Margem de contribuição
(-) Despesas operacionais
(-) Despesas com pessoal
  = Resultado operacional
(+) Receitas não operacionais
(-) Outras despesas
  = Resultado líquido
```

A estrutura fica em [src/dados/dre.js](src/dados/dre.js), separada da tela em
[src/telas/TelaDre.jsx](src/telas/TelaDre.jsx). A coluna `% RL` é a participação
na **receita líquida** — não na bruta, porque é sobre a líquida que margem e
despesa se medem. Clicar numa linha abre o módulo; módulo sem contas na visão
aparece na estrutura, zerado e sem clique.

### Dimensões da tela do módulo

À esquerda ficam os painéis das dimensões que compõem a célula, **lado a lado**,
na ordem em que se escolhe:

| Painel | Quando aparece |
|---|---|
| Centro de custo | módulo com `usaCentro` na visão |
| Receita (base do %) | módulo `percentual` |
| Contas do módulo | sempre |

Filial e período seguem no topo — filial é da tela inteira e o período é o ano do
plano. O centro de custo saiu do topo para a lateral: ele é uma dimensão da
célula, como a conta, e ficava escondido num `select` enquanto valia tanto quanto
ela. A coluna da esquerda cresce com o número de painéis (`data-paineis` no
layout), então a tabela só cede a largura de que os painéis precisam.

Gravar exige uma escolha em cada painel: em "Total" o valor é soma de várias
chaves e não há onde gravar.

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

## Acesso

### Login

**O portal não guarda senha.** Quem valida é o Active Directory, por bind: se o
bind passa, a senha está certa. Não há hash, não há redefinição, não há senha
padrão — trocar a senha do Windows troca a do portal.

O login aceita as três formas que a pessoa já usa (`fulano`, `DOMINIO\fulano`,
`fulano@dominio`) e todas viram um só login em `normalizarLogin`.

Ter conta no AD **não** dá acesso: é preciso uma linha em
`KING_IDENTIDADE_ACESSO` para o app `orcamento`. Quem concede é um administrador,
pela tela de Usuários. `PORTAL_ADMINS` no `.env` existe só para destravar o
primeiro — sem ele não haveria como criar o primeiro admin, porque a tela exige
já ser admin.

**A sessão** dura 8 horas e renova a cada uso. O cookie é `httpOnly` +
`SameSite=Lax`; no banco fica o **SHA-256** do id, nunca o valor do cookie, para
que um dump ou uma consulta de suporte não entreguem sessão viva. Revogar acesso
apaga as sessões abertas na hora — revogação que só vale depois de expirar não é
revogação.

**Limite de tentativas** ([server/limite.js](server/limite.js)): 5 falhas no
mesmo login param de ir ao AD por 5 minutos. O alvo não é adivinhação de senha —
é impedir que o portal dispare a política de **bloqueio de conta** do AD, que
tiraria a pessoa do Windows e do e-mail, não só daqui. Há também um limite por
origem, que conta **logins distintos** e não tentativas: atrás de proxy ou NAT
toda a empresa chega com o mesmo IP, e contar tentativas faria dele um fusível
geral. Falha de rede/configuração (503) não conta como tentativa.

### Permissão

A concessão tem três dimensões — **módulo, filial, centro de custo** — e `null`
em qualquer uma vale por *todas*. As linhas somam; vale a mais permissiva. A
linha existir já dá o direito de **ver**; `PODE_EDITAR` diz se também lança.

```
{ modulo: null,             filial: null,     centro: null,  editar: true  }  tudo
{ modulo: null,             filial: "000025", centro: null,  editar: true  }  uma filial
{ modulo: "receita-vendas", filial: null,     centro: null,  editar: false }  só vê a receita
```

O recorte vale nos dois lados: a API recusa o que está fora dele, e a tela não
mostra o que a pessoa não pode ver — nome de filial e de centro já diz o tamanho
da operação. Em Configurações as filiais aparecem sem caixa de seleção, porque
"quais filiais o portal usa" é decisão global de administrador.

**Módulo sem centro de custo.** Receita de vendas não tem a dimensão centro, e a
tela consulta com `SEM_CENTRO`. Uma concessão presa a um centro não casa com
isso, de propósito: quem cuida do e-commerce não ganha a receita da empresa de
brinde. Como Deduções e Custos calculam percentual **sobre a receita**, quem
precisa desse cálculo recebe a linha explícita de leitura da receita — sem ela o
percentual fica sem base e a coluna em reais zera.

**O DRE exige todos os módulos.** Com um de fora, "margem bruta" e "resultado
líquido" deixam de ser o resultado da empresa e viram números que não fecham com
nada — então ele some da barra lateral em vez de mostrar meia consolidação.

A avaliação é uma função pura em
[src/dados/permissoes.js](src/dados/permissoes.js), usada pelo front e coberta
por teste; a decisão de verdade é sempre a do servidor.

### Identidade compartilhada entre portais

As tabelas `KING_IDENTIDADE_*` são de todos os portais AKR, não deste. Cada um
tem sua linha em `KING_IDENTIDADE_ACESSO` por `APP`, então desativar alguém aqui
não mexe no Modelagem nem no Envio de Documentos. As permissões específicas do
orçamento ficam à parte, em `KING_PORTAL_ORC_ACESSO`.

## Estrutura

```
server/
├── index.js                 Express + rotas /api/*
├── sqlserver.js             pool mssql, query/queryOne/transaction
├── consultas.js             SELECTs do ERP (views confirmadas)
├── repositorio.js           leitura e gravação do estado do portal
├── ldap.js                  bind e busca no Active Directory
├── identidade.js            sessão, middleware, quem-pode-o-quê
├── limite.js                limite de tentativas de login
└── usuarios.js              administração de acesso e permissão

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
│   ├── mapeamentoPadrao.js  o que se sabe do Scoreplan, isolado num lugar só
│   ├── permissoes.js        avaliação de acesso (pura, espelha o servidor)
│   ├── dre.js               consolidação dos módulos em linhas de resultado
│   └── plano.js             modelo do plano, agregações e cálculos
├── lib/
│   ├── formato.js           moeda/percentual pt-BR e leitura de números
│   ├── api.js               cliente das rotas /api/*
│   ├── useErp.js            carga dos cadastros e do realizado
│   ├── estado.js            visões, planos e planejado via API
│   ├── persistencia.js      normalização + leitura do localStorage legado
│   ├── useSessao.js         sessão do usuário no front
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
| Visões (módulo → contas) | portal, `KING_PORTAL_ORC_VISAO*` |
| Planos e valores planejados | portal, `KING_PORTAL_ORC_PLANO`/`_PLANEJADO` |
| Usuários e permissões | `KING_IDENTIDADE_*` + `KING_PORTAL_ORC_ACESSO` |

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

Além do SQL Server, o `.env` traz as chaves `LDAP_*` (conexão com o AD) e
`PORTAL_ADMINS` (quem entra como administrador antes de existir o primeiro).

### Criar as tabelas

Os scripts em [sql/](sql/) rodam **na ordem**, uma vez, direto no SQL Server —
a aplicação nunca executa DDL:

| Script | O que cria |
|---|---|
| `001-identidade.sql` | `KING_IDENTIDADE_*`, compartilhado entre os portais AKR |
| `002-orcamento-acesso.sql` | `KING_PORTAL_ORC_ACESSO`, permissão deste portal |
| `003-orcamento-dados.sql` | visões, planos e planejado |

São idempotentes (`IF OBJECT_ID … IS NULL`): rodar de novo não apaga nada.

`PLANEJADO.VALOR` é `DECIMAL(18,6)` porque a mesma coluna guarda reais e
percentuais — em módulo percentual, 38,959531% arredondado a duas casas vira uns
R$ 500 de diferença sobre uma base de 133 milhões.

Verificar:

```bash
npm run api
curl http://localhost:3000/api/health            # { ok: true, banco: "KINGEJOE" }
```

`/api/health` é a única rota aberta. Todas as outras exigem sessão — os dados do
ERP são da empresa e não ficam à disposição de quem alcançar a porta. Para
conferi-las, entre pelo navegador ou rode `npm run integracao`, que abre a
própria sessão.

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

## Deploy

Roda na VM de portais AKR (Ubuntu, usuário `king`), como serviço systemd em
`/opt/portal-orcamento`, na **porta 3004** — 3000 a 3003 são dos outros portais.
Fica público por rota no Cloudflare Tunnel; app Node não usa Apache nem
certificado próprio.

O script vive dentro do repositório, então na primeira vez o clone vem antes:

```bash
sudo mkdir -p /opt/portal-orcamento
sudo chown king:king /opt/portal-orcamento
git clone <url do repo> /opt/portal-orcamento
sudo bash /opt/portal-orcamento/deploy/setup.sh
```

O script para e pede o `.env`; preencha (incluindo `API_PORT=3004` e
`API_HOST=127.0.0.1`) e rode de novo.

```bash
# atualizar, daí em diante
sudo bash /opt/portal-orcamento/deploy/setup.sh   # pull + build + testes + restart

# implantar outra branch que não a main
BRANCH=login-sistema sudo -E bash /opt/portal-orcamento/deploy/setup.sh
```

O script é idempotente e **nunca cria nem sobrescreve o `.env`** — credencial não
vem do repositório, e sobrescrever derrubaria o portal.

**Não há migração de dados.** É o mesmo banco `KINGEJOE` usado em
desenvolvimento, com as tabelas já criadas; subir na VM é apontar outro processo
para o mesmo lugar.

O Node do sistema (v20.x) basta: este portal não usa `node:sqlite`, então não
depende do Node 24 do nvm como o portal-bi e o portal-envio-documentos.

### O front em produção

Em desenvolvimento quem entrega o React é o Vite, que ainda faz proxy de `/api`.
Na VM não existe Vite: o próprio Express serve o `dist/`, com fallback de SPA
para as rotas que só existem no navegador. O `express.static` só liga quando o
build existe, então `npm run api` sozinho continua sendo API pura.

### Rede

| Variável | Na VM | Por quê |
|---|---|---|
| `API_PORT` | `3004` | 3000–3003 ocupadas |
| `API_HOST` | `127.0.0.1` | só o `cloudflared`, no mesmo host, precisa alcançar |
| `TRUST_PROXY` | (padrão `loopback`) | ler o IP real do visitante no `X-Forwarded-For` |

`API_HOST` e `TRUST_PROXY` andam juntos e não são detalhe: atrás do túnel, toda
requisição chega como `127.0.0.1`, e sem `trust proxy` o limite por origem
passaria a ver a empresa inteira como uma origem só. Mas confiar no cabeçalho é
seguro **apenas** porque nada além do próprio host alcança a porta — daí o bind
em loopback. Trocar um sem o outro abre o caminho para forjar `X-Forwarded-For` e
escapar do limite a cada tentativa.

### Cloudflare

Rota no túnel `portal-modelagem` → `orcamento.akrbrands.com.br` →
`http://localhost:3004`, e **Cloudflare Access na frente**. O portal expõe um
formulário que valida senha de rede do AD; sem o Access ele fica alcançável por
qualquer um na internet, que é exatamente o cenário de bloqueio de contas em
massa que o limite de tentativas existe para conter.

## Padrão visual

Segue o [PADRAO-PROJETOS-AKR.md](PADRAO-PROJETOS-AKR.md): sidebar preta de 256px
com a marca `AKR | BRANDS`, acento azul `#3f8ae0`, tokens de cor em `:root` com
tema claro e escuro, script de tema inline no `<head>` (evita o flash branco),
modais em `<dialog>` com layout flex-column e botão desabilitado com aparência
de desabilitado.

Uma divergência consciente: **stack React + Vite puro**, não TanStack Start +
Tailwind.

## Testes

`npm test` roda a camada de dados com o runner nativo do Node (`node --test`),
sem dependência extra. A cobertura foca nos pontos onde um erro vira número
errado na tela: leitura de número pt-BR, corte temporal do realizado, módulo sem
contas, isolamento da edição por módulo/filial/ano, denominador das médias,
limpeza de chaves órfãs, avaliação de permissão, limite de tentativas de login e
o aviso de sessão expirada.

**Não depende de banco nem de rede** — e é por isso que os testes de integração
ficam fora de `test/`: `node --test` varre aquela pasta inteira, e um `npm test`
que precisa do KINGEJOE no ar deixa de ser executável.

`npm run integracao` roda contra o banco de verdade (`scripts/integracao/`):
sessão e middleware, leitura/gravação do estado, importação do legado e
administração de usuários. Cria e apaga os próprios registros, todos com prefixo
`__t`. Precisa de `.env` preenchido.

Os componentes não têm teste automatizado — foram verificados por renderização.

## Pendências conhecidas

Em ordem de risco.

**Infraestrutura — depende de quem administra AD e banco**

- **LDAP sem TLS.** A conexão com o controlador de domínio usa `ldap://`, então
  a senha de rede trafega sem cifra a cada login. `ldaps://` só passa a funcionar
  quando o DC tiver certificado de Autenticação de Servidor instalado; hoje a
  porta 636 aceita conexão e derruba o handshake em todas as versões de TLS.
  Depois disso, `LDAP_TLS_REJECT_UNAUTHORIZED` volta a `true`.
- **Conta de serviço do SQL Server.** A conexão ainda usa conta pessoal. O
  portal escreve no banco: precisa de conta própria, com permissão só sobre as
  `KING_*` e `SELECT` no resto.
- **Backup das `KING_PORTAL_ORC_*`.** O orçamento agora só existe no SQL Server.
  Confirmar que essas tabelas entram na rotina de backup do KINGEJOE.
- **Rota no Cloudflare e card no hub** são passos manuais no painel, ainda não
  feitos — ver [Deploy](#deploy).

**Funcional**

- **Sem aviso de edição concorrente.** Duas pessoas no mesmo plano: a última a
  gravar vence, em silêncio.
- **Auditoria sem tela.** `ALTERADO_POR`/`ALTERADO_EM` são gravados desde o
  começo e não há como consultá-los pelo portal.
- **Sessão expirada só some quando alguém tenta usá-la** — não há limpeza
  periódica da tabela.
- **Dois módulos sem mapeamento padrão**: Receitas não operacionais e Despesas
  com pessoal. Configuráveis na mão; só não vêm prontos.

**Cadastro do ERP**

Duas correções vivem hoje em [src/dados/mapeamentoPadrao.js](src/dados/mapeamentoPadrao.js)
e existem só porque o cadastro do ERP está incorreto. Arrumado o cadastro, o
código sai:

- `4.6.5.01` e `4.6.5.02` são receita cadastrada como `DF` (`CORRECOES_DE_SINAL`).
- O lançamento não registra a qual receita o valor pertence, então 9 das 11
  receitas ficam sem realizado e a atribuição é deduzida pelo centro de custo
  (`RECEITA_DO_REALIZADO`).

**Aberto com o negócio**

- Falta confirmar se o Scoreplan deixa `3.1.1.01.005`, `3.1.1.01.060` e
  `3.1.1.05.001` fora da Receita de vendas de propósito.
