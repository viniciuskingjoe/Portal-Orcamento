// ============================================================================
// MÓDULOS DO ORÇAMENTO
//
// Lista fixa. Uma visão define, para cada módulo, quais classificações do plano
// de contas o compõem; o plano escolhe uma visão e passa a orçar esses módulos.
//
// `tipo` decide a leitura do realizado: receita cresce a crédito, despesa a
// débito (ver dados/realizado.js).
// ============================================================================

export const MODULOS = [
  { id: "receita-vendas", titulo: "Receita de vendas", tipo: "receita", icone: "chart" },
  { id: "receitas-nao-operacionais", titulo: "Receitas não operacionais", tipo: "receita", icone: "coins" },
  { id: "deducoes-vendas", titulo: "Deduções de vendas", tipo: "despesa", icone: "trendingDown" },
  { id: "custos-variaveis", titulo: "Custos variáveis", tipo: "despesa", icone: "layers" },
  { id: "despesas-variaveis", titulo: "Despesas variáveis", tipo: "despesa", icone: "percent" },
  { id: "despesas-operacionais", titulo: "Despesas operacionais", tipo: "despesa", icone: "building" },
  { id: "outras-despesas", titulo: "Outras despesas", tipo: "despesa", icone: "wallet" },
  { id: "despesas-pessoal", titulo: "Despesas com pessoal", tipo: "despesa", icone: "users" },
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
