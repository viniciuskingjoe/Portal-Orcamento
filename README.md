# Portal Orçamento

Planejamento orçamentário da King & Joe / AKR Brands. SPA em React + Vite.

> **Estado atual: protótipo de interface.** Não há backend, banco nem
> autenticação. Os números vêm de um mock determinístico e as edições ficam no
> `localStorage` do navegador. Não use como fonte de verdade contábil.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev      # servidor de desenvolvimento (com Fast Refresh)
npm test         # testes da camada de dados
npm run build    # build de produção em dist/
npm run preview  # serve o build
```

## Estrutura

```
src/
├── main.jsx                 entrada; importa os CSS
├── App.jsx                  estado da aplicação e roteamento entre telas
├── dados/
│   ├── contas.js            plano de contas (receita e dedução)
│   ├── seeds.js             dimensões iniciais + parâmetros do mock
│   ├── calendario.js        até que mês existe "realizado"
│   ├── mock.js              geradores determinísticos  ← trocar pelo banco
│   └── plano.js             modelo do plano, agregações e cálculos
├── lib/
│   ├── formato.js           moeda/percentual pt-BR e leitura de números
│   ├── persistencia.js      localStorage             ← trocar pela API
│   └── tema.js              tema claro/escuro
├── componentes/             UI reutilizável (Sidebar, Modal, Tabela, ...)
├── telas/                   uma tela por módulo
└── estilos/
    ├── tokens.css           tokens de cor claro/escuro (PADRAO §2)
    └── app.css              estilos dos componentes
```

### Como o plano guarda os valores

`plano.planejado` e `plano.pctPlanejado` guardam **somente as edições manuais**.
Quando não há edição para uma célula, o valor vem do gerador em `dados/mock.js`,
usando os parâmetros que vivem na própria dimensão (`fator` da filial, `bases`
do canal, `percentualBase` da dedução).

Consequência prática: uma filial ou canal criado pela tela nasce com parâmetro
`0` e fica coerente — planejado **e** realizado zerados. Dimensões criadas na
tela recebem `manual: true` e por isso não somem quando o filtro "ocultar canais
sem valores" está ligado.

### Trocar o mock pelo banco

Três arquivos concentram tudo que é falso:

| Arquivo | O que substituir |
|---|---|
| `src/dados/mock.js` | as quatro funções `gerar*` viram consultas |
| `src/dados/seeds.js` | dimensões iniciais e os campos de parâmetro do mock |
| `src/lib/persistencia.js` | `localStorage` vira `fetch` da API |

`src/dados/plano.js` já trabalha só com os dados agregados, então as telas não
mudam.

## Padrão visual

Segue o [PADRAO-PROJETOS-AKR.md](PADRAO-PROJETOS-AKR.md): sidebar preta de 256px
com a marca `AKR | BRANDS`, acento azul `#3f8ae0`, tokens de cor em `:root` com
tema claro e escuro, script de tema inline no `<head>` (evita o flash branco),
modais em `<dialog>` com layout flex-column e botão desabilitado com aparência
de desabilitado.

Duas divergências conscientes do padrão:

- **Sem card de usuário com "Sair"** no rodapé da sidebar. O portal ainda não
  tem autenticação; o rodapé identifica a empresa em vez de simular um login.
- **Stack React + Vite puro**, não TanStack Start + Tailwind. O projeto nasceu
  assim e migrar não traria ganho enquanto for protótipo de tela.

## Testes

`npm test` roda a camada de dados com o runner nativo do Node (`node --test`).
A cobertura foca nos pontos onde um erro vira número errado na tela: leitura de
número pt-BR, corte temporal do realizado, coerência de dimensões novas,
denominador das médias e limpeza de chaves órfãs ao excluir uma dimensão.

Os componentes não têm teste automatizado — foram verificados por renderização.

## Pendências conhecidas

- Sem backend: os dados vivem no navegador de cada usuário e não são compartilhados.
- Sem autenticação nem RBAC (o padrão exige enforcement no backend).
- Sem deploy: falta `deploy/setup.sh`, service systemd e `.env.example`.
- `localStorage` tem limite de ~5 MB; muitos planos com muitas edições podem
  estourar. A aplicação avisa na tela quando a gravação falha.
