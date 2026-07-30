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
// ============================================================================

export const GRUPOS = {
  R: { rotulo: "Receita", chip: "receita" },
  DV: { rotulo: "Despesa variável", chip: "despesa" },
  DF: { rotulo: "Despesa fixa", chip: "despesa" },
};

export const MODULOS = [
  { id: "receita-vendas", titulo: "Receita de vendas", tipo: "receita", grupo: "R", icone: "chart" },
  { id: "receitas-nao-operacionais", titulo: "Receitas não operacionais", tipo: "receita", grupo: "R", icone: "coins" },
  // As contas de dedução (devolução, ICMS/PIS/COFINS sobre vendas) são DV no ERP.
  { id: "deducoes-vendas", titulo: "Deduções de vendas", tipo: "despesa", grupo: "DV", icone: "trendingDown" },
  { id: "custos-variaveis", titulo: "Custos variáveis", tipo: "despesa", grupo: "DV", icone: "layers" },
  { id: "despesas-variaveis", titulo: "Despesas variáveis", tipo: "despesa", grupo: "DV", icone: "percent" },
  { id: "despesas-operacionais", titulo: "Despesas operacionais", tipo: "despesa", grupo: "DF", icone: "building" },
  { id: "outras-despesas", titulo: "Outras despesas", tipo: "despesa", grupo: "DF", icone: "wallet" },
  { id: "despesas-pessoal", titulo: "Despesas com pessoal", tipo: "despesa", grupo: "DF", icone: "users" },
];

const POR_ID = new Map(MODULOS.map((modulo) => [modulo.id, modulo]));

export function modulo(id) {
  return POR_ID.get(id) ?? null;
}

export function ehModulo(id) {
  return POR_ID.has(id);
}

export const MODULOS_RECEITA = MODULOS.filter((item) => item.tipo === "receita");
export const MODULOS_DESPESA = MODULOS.filter((item) => item.tipo === "despesa");
