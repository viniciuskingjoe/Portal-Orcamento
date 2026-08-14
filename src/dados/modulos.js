// ============================================================================
// MÓDULOS DO ORÇAMENTO
//
// Lista fixa. Uma visão define, para cada módulo, quais classificações do plano
// de contas o compõem; o plano escolhe uma visão e passa a orçar esses módulos.
//
// `tipo` decide a leitura do realizado: receita cresce a crédito, despesa a
// débito (ver dados/realizado.js).
//
// `grupo` é o LX_GRUPO_CONTABIL que o módulo aceita — cada módulo só oferece as
// contas do seu grupo:
//   R   receita
//   DV  despesa variável
//   DF  despesa fixa
//
// `percentual` muda o que se digita: em vez do valor em reais, digita-se o
// percentual sobre a RECEITA DE VENDAS PLANEJADA do mesmo mês e da mesma filial,
// e a tabela mostra o valor ao lado. É como se orça o que acompanha a receita —
// dedução e custo variável sobem junto com a venda, então travar um valor fixo
// em reais seria planejar contra a própria previsão de faturamento.
// ============================================================================

export const GRUPOS = {
  R: { rotulo: "Receita", chip: "receita" },
  DV: { rotulo: "Despesa variável", chip: "despesa" },
  DF: { rotulo: "Despesa fixa", chip: "despesa" },
};

export const MODULOS = [
  {
    id: "receita-vendas",
    titulo: "Receita de vendas",
    tipo: "receita",
    grupo: "R",
    icone: "chart",
  },
  {
    id: "receitas-nao-operacionais",
    titulo: "Receitas não operacionais",
    tipo: "receita",
    grupo: "R",
    icone: "coins",
  },
  // As contas de dedução (devolução, ICMS/PIS/COFINS sobre vendas) são DV no ERP.
  {
    id: "deducoes-vendas",
    titulo: "Deduções de vendas",
    tipo: "despesa",
    grupo: "DV",
    icone: "trendingDown",
    percentual: true,
  },
  {
    id: "custos-variaveis",
    titulo: "Custos variáveis",
    tipo: "despesa",
    grupo: "DV",
    icone: "layers",
    percentual: true,
  },
  {
    id: "despesas-variaveis",
    titulo: "Despesas variáveis",
    tipo: "despesa",
    grupo: "DV",
    icone: "percent",
  },
  {
    id: "despesas-operacionais",
    titulo: "Despesas operacionais",
    tipo: "despesa",
    grupo: "DF",
    icone: "building",
  },
  {
    id: "outras-despesas",
    titulo: "Outras despesas",
    tipo: "despesa",
    grupo: "DF",
    icone: "wallet",
  },
  // O único módulo que não orça valor: aqui se informa QUANTAS pessoas o centro
  // tem no mês. O R$ dessas contas fica em Despesas operacionais, onde sempre
  // esteve — a quantidade é do centro, não da conta, e por isso não cabe lá.
  {
    id: "despesas-pessoal",
    titulo: "Despesas com pessoal",
    tipo: "despesa",
    grupo: "DF",
    icone: "users",
    quantidade: true,
  },
];

const POR_ID = new Map(MODULOS.map((modulo) => [modulo.id, modulo]));

export function modulo(id) {
  return POR_ID.get(id) ?? null;
}

export function ehModulo(id) {
  return POR_ID.has(id);
}

// Módulo em que se digita percentual, não reais. O módulo que serve de base é
// sempre Receita de vendas — e ele nunca é percentual, senão a base dependeria
// de si mesma.
export const MODULO_BASE_DO_PERCENTUAL = "receita-vendas";

export function ehPercentual(id) {
  return POR_ID.get(id)?.percentual === true;
}

// Módulo que guarda quantidade de pessoas em vez de dinheiro. Não tem conta,
// não entra na publicação do valor e não soma com os outros — quem pergunta
// isso antes de tratar um módulo como orçado evita somar gente com reais.
export function ehQuantidade(id) {
  return POR_ID.get(id)?.quantidade === true;
}

// Os módulos que de fato orçam R$. É esta lista que vale para consolidar,
// publicar e conferir.
export const MODULOS_DE_VALOR = MODULOS.filter((item) => item.quantidade !== true);

export const MODULOS_RECEITA = MODULOS.filter((item) => item.tipo === "receita");
export const MODULOS_DESPESA = MODULOS.filter((item) => item.tipo === "despesa");
