// ============================================================================
// MÓDULOS DO ORÇAMENTO
//
// Lista fixa. Uma visão define, para cada módulo, quais contas o compõem; o
// plano escolhe uma visão e passa a orçar esses módulos.
//
// `base` é parâmetro do mock determinístico (valor mensal de referência antes
// do fator da filial e da sazonalidade). Sai quando o banco entrar.
// ============================================================================

export const MODULOS = [
  {
    id: "receita-vendas",
    titulo: "Receita de vendas",
    tipo: "receita",
    icone: "chart",
    base: 3560000,
  },
  {
    id: "receitas-nao-operacionais",
    titulo: "Receitas não operacionais",
    tipo: "receita",
    icone: "coins",
    base: 356000,
  },
  {
    id: "deducoes-vendas",
    titulo: "Deduções de vendas",
    tipo: "despesa",
    icone: "trendingDown",
    base: 468000,
  },
  {
    id: "custos-variaveis",
    titulo: "Custos variáveis",
    tipo: "despesa",
    icone: "layers",
    base: 1420000,
  },
  {
    id: "despesas-variaveis",
    titulo: "Despesas variáveis",
    tipo: "despesa",
    icone: "percent",
    base: 285000,
  },
  {
    id: "despesas-operacionais",
    titulo: "Despesas operacionais",
    tipo: "despesa",
    icone: "building",
    base: 512000,
  },
  {
    id: "outras-despesas",
    titulo: "Outras despesas",
    tipo: "despesa",
    icone: "wallet",
    base: 96000,
  },
  {
    id: "despesas-pessoal",
    titulo: "Despesas com pessoal",
    tipo: "despesa",
    icone: "users",
    base: 740000,
  },
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
