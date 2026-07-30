import { modulo } from "./modulos.js";

// ============================================================================
// PLANO DE CONTAS
//
// PROVISÓRIO. Só as faixas de receita (3.1.1.x) e de dedução (3.1.9.x) existem
// aqui. Custos variáveis, despesas operacionais, despesas com pessoal e outras
// despesas ainda não têm suas contas — elas vêm do banco (view do ERP).
//
// Ao plugar o banco, `contasDoModulo()` é o único ponto que muda: passa a
// consultar a view em vez de escolher entre estas duas listas.
// ============================================================================

export const CONTAS_RECEITA = [
  { id: "3.1.1.01.001", codigo: "3.1.1.01.001", descricao: "VENDAS DE PRODUTOS - COLEÇÃO" },
  { id: "3.1.1.01.002", codigo: "3.1.1.01.002", descricao: "VENDAS DE PRODUTOS - SALDO" },
  { id: "3.1.1.01.003", codigo: "3.1.1.01.003", descricao: "VENDAS DE PRODUTOS - BAZAR" },
  { id: "3.1.1.01.004", codigo: "3.1.1.01.004", descricao: "VENDAS DE PRODUTOS - E-COMMERCE" },
  { id: "3.1.1.01.005", codigo: "3.1.1.01.005", descricao: "VENDAS DE PRODUTOS - MOSTRUÁRIO" },
  { id: "3.1.1.01.006", codigo: "3.1.1.01.006", descricao: "VENDAS DE RESÍDUOS TÊXTEIS" },
  { id: "3.1.1.01.007", codigo: "3.1.1.01.007", descricao: "VENDAS DE MERCADORIAS - COLEÇÃO" },
  { id: "3.1.1.01.050", codigo: "3.1.1.01.050", descricao: "VENDAS DE PRODUTOS NO MERCADO EXTERNO" },
  { id: "3.1.1.01.051", codigo: "3.1.1.01.051", descricao: "VENDAS DE MERCADORIAS NO MERCADO EXTERNO" },
  { id: "3.1.1.01.052", codigo: "3.1.1.01.052", descricao: "VENDAS DE MERCADORIAS E PRODUTOS" },
  { id: "3.1.1.01.060", codigo: "3.1.1.01.060", descricao: "FABRICAÇÃO POR ENCOMENDA" },
  { id: "3.1.1.02.001", codigo: "3.1.1.02.001", descricao: "SERVIÇOS PRESTADOS MERCADO INTERNO" },
  { id: "3.1.1.02.002", codigo: "3.1.1.02.002", descricao: "SERVIÇOS PRESTADOS MERCADO EXTERNO" },
  { id: "3.1.1.05.001", codigo: "3.1.1.05.001", descricao: "VENDAS DE MERCADORIA - LOJAS" },
];

export const CONTAS_DEDUCAO = [
  { id: "3.1.9.01.001", codigo: "3.1.9.01.001", descricao: "DEVOLUÇÕES DE VENDAS" },
  { id: "3.1.9.01.002", codigo: "3.1.9.01.002", descricao: "ABATIMENTOS E DESCONTOS" },
  { id: "3.1.9.02.001", codigo: "3.1.9.02.001", descricao: "ICMS SOBRE VENDAS" },
  { id: "3.1.9.02.002", codigo: "3.1.9.02.002", descricao: "PIS SOBRE VENDAS" },
  { id: "3.1.9.02.003", codigo: "3.1.9.02.003", descricao: "COFINS SOBRE VENDAS" },
  { id: "3.1.9.02.004", codigo: "3.1.9.02.004", descricao: "IPI SOBRE VENDAS" },
  { id: "3.1.9.02.005", codigo: "3.1.9.02.005", descricao: "SIMPLES NACIONAL" },
];

const TODAS = [...CONTAS_RECEITA, ...CONTAS_DEDUCAO];
const POR_ID = new Map(TODAS.map((conta) => [conta.id, conta]));

export function conta(id) {
  return POR_ID.get(id) ?? null;
}

// Contas que podem ser vinculadas a um módulo.
// ← PONTO DE TROCA PELO BANCO: substituir por consulta à view do plano de
//   contas, filtrando pela faixa correspondente ao módulo.
export function contasDoModulo(moduloId) {
  const alvo = modulo(moduloId);
  if (!alvo) return [];
  return alvo.tipo === "receita" ? CONTAS_RECEITA : CONTAS_DEDUCAO;
}
