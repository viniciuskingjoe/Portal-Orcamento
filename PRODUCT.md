# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Funcionários internos da AKR Brands (King&Joe), dois perfis:

- **Responsável de área/centro de custo:** lança o planejado só dos módulos e
  centros a que tem permissão (RBAC granular por módulo/filial/centro em
  `TelaUsuarios.jsx`/permissões).
- **Administrador/controladoria:** configura estrutura (planos, visões,
  módulos, contas, filiais, centros, grupos de centro de custo), gerencia
  usuários, e é quem enxerga o DRE completo — `podeVerDre` só é `true` para
  quem vê todos os módulos, porque um DRE com módulo faltando mostraria um
  resultado que não é o resultado real da empresa.

## Product Purpose

Substituir o Scoreplan (ferramenta de orçamento/DRE usada antes pela empresa)
por um portal próprio, com a mesma lógica de planejamento por módulo/conta/
centro de custo, mas já integrado ao Linx ERP (dados de "Realizado" e "Ano
anterior" vêm de lá, `/api/realizado`) e adaptado à estrutura interna da AKR.
Sucesso = cada área lança o planejado do seu recorte, controladoria consolida
e lê o DRE configurável comparando planejado × realizado × ano anterior, sem
depender de planilha nem da ferramenta anterior.

## Positioning

Orçamento e DRE configuráveis nativos da estrutura da empresa (filiais,
centros de custo, módulos, grupos de centro de custo), com Realizado e Ano
Anterior puxados direto do Linx ERP em vez de digitados/importados à mão —
diferença que uma ferramenta genérica de mercado (como o Scoreplan) não
replica sem integração sob medida.

## Operating Context

- Uso interno, via VM da empresa (deploy padrão AKR — ver
  `PADRAO-PROJETOS-AKR.md`), sem requisito de acessibilidade formal adicional
  além do RBAC.
- Fluxo típico: admin monta plano orçamentário do ano (com módulos, contas,
  visões, DRE configurável) → cada responsável de área preenche o planejado
  do seu módulo/centro → tela de leitura do DRE compara planejado, realizado
  (Linx ERP) e ano anterior, com filtros de filial, grupo de centro de custo e
  período.
- Um plano novo com ano N busca automaticamente o "ano anterior" (N-1) do Linx
  ERP de forma dinâmica, sem precisar de outro plano cadastrado pra isso.

## Capabilities and Constraints

- 8 módulos fixos de orçamento (`MODULOS`), alguns em reais e outros em
  percentual (ex.: Deduções de vendas, Custos variáveis calculam sobre uma
  base, não são valor direto).
- Despesas com pessoal e outras contas podem ser **calculadas por fórmula**
  (`dados/formula.js`, parser `V[código]`/`L[linha]`, sem eval).
- DRE é **configurável**: cada linha escolhe se vem de um módulo (com recorte
  de contas) ou de uma fórmula entre linhas; tem grupo de centro de custo
  como "lente" sobre a leitura.
- RBAC aplicado no backend e no frontend: leituras são recortadas por
  módulo/filial/centro, e cada célula de escrita é revalidada no servidor. A UI
  também esconde ou desabilita o que está fora do escopo, mas não é a barreira
  de segurança.
- Stack: React 19 + Vite no front, Node/Express + SQL Server (`mssql`, sem
  ORM) no back — já estabelecido, sem decisão pendente.

## Brand Commitments

Segue o padrão visual AKR documentado em `PADRAO-PROJETOS-AKR.md`: wordmark
"AKR | BRANDS", sidebar preta fixa (`#0b0f0e`) nos dois temas, acento azul
`#3f8ae0`, tokens de cor em CSS custom properties, tema claro/escuro via
`data-theme`. Não é opcional nem uma sugestão — é o padrão replicado entre
todos os portais internos da empresa (Fluxo Fiscal, Portal-Saldo,
Portal-Modelagem).

## Evidence on Hand

- `PADRAO-PROJETOS-AKR.md` na raiz do repo: tokens de cor completos, regras
  de tema escuro, convenções de arquitetura/deploy — autoridade viva pra
  qualquer decisão visual, não precisa reconstituir do zero.
- Sem imagens/logo em arquivo (marca é wordmark textual via CSS, não
  logotipo). Sem testemunhos, cases ou dados de marketing — é ferramenta
  interna, não tem página voltada pra público externo.

## Product Principles

1. A estrutura da empresa (filial → centro de custo → módulo → conta) é a
   fonte de verdade; a tela nunca inventa um recorte que o RBAC não permite.
2. Realizado e Ano anterior são sempre dados do Linx ERP, nunca digitados —
   se a tela mostra um desses valores, ele tem que vir de lá.
3. DRE é resultado de configuração, não de código fixo — qualquer estrutura
   de demonstrativo (novas linhas, fórmulas, subtotal) se monta pela tela de
   configuração, sem precisar mexer em `dados/dre.js`.
4. Sinal do realizado pode ser corrigido por conta na visão; no DRE, cada conta
   escolhida também pode ter seu próprio sinal. Preservar essas duas camadas e
   não inferir sinal apenas pelo módulo.
5. Consistência com os outros portais AKR pesa mais que preferência pontual
   de tela — mudança visual que quebra o padrão de sidebar/tokens/tema é
   suspeita por padrão.

## Accessibility & Inclusion

Nenhum requisito formal adicional estabelecido. Mesmo em uso interno, os fluxos
principais mantêm navegação por teclado, nomes acessíveis, contraste, alvos de
toque adequados e respeito a movimento reduzido; RBAC não substitui
acessibilidade.
