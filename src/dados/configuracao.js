import { CENTROS_SEED, FILIAIS_SEED } from "./seeds.js";

// ============================================================================
// CONFIGURAÇÃO GLOBAL
//
// Filiais e centros de custo são do portal, não de um plano: os dois vêm do ERP
// e valem para todos os planos. Antes viviam dentro de `plano.*`, o que fazia
// cada plano ter sua própria cópia da mesma lista.
//
// ← PONTO DE TROCA PELO BANCO: /api/filiais e /api/centros-de-custo.
// ============================================================================

const CAMPO_POR_TIPO = {
  filiais: "filiais",
  centros: "centros",
};

export function campoDaDimensao(tipo) {
  return CAMPO_POR_TIPO[tipo] ?? null;
}

export function configuracaoInicial() {
  return {
    filiais: FILIAIS_SEED.map((item) => ({ ...item })),
    centros: CENTROS_SEED.map((item) => ({ ...item })),
  };
}

export function adicionarItem(configuracao, tipo, item) {
  const campo = campoDaDimensao(tipo);
  if (!campo) return configuracao;
  return { ...configuracao, [campo]: [...configuracao[campo], item] };
}

export function renomearItem(configuracao, tipo, id, nome) {
  const campo = campoDaDimensao(tipo);
  if (!campo) return configuracao;
  return {
    ...configuracao,
    [campo]: configuracao[campo].map((item) => (item.id === id ? { ...item, nome } : item)),
  };
}

export function removerItem(configuracao, tipo, id) {
  const campo = campoDaDimensao(tipo);
  if (!campo) return configuracao;
  return {
    ...configuracao,
    [campo]: configuracao[campo].filter((item) => item.id !== id),
  };
}

export function filial(configuracao, id) {
  return configuracao.filiais.find((item) => item.id === id) ?? null;
}
