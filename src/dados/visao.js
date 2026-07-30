import { MODULOS } from "./modulos.js";

// ============================================================================
// VISÃO
//
// Uma visão é global (não pertence a um plano) e diz, para cada módulo do
// orçamento, quais contas o compõem:
//
//   { id, nome, modulos: { "receita-vendas": ["3.1.1.01.001", ...], ... } }
//
// O plano escolhe uma visão na criação e orça os módulos dela.
// ============================================================================

export function criarVisao(id, nome, modulos = {}) {
  return { id, nome, modulos: { ...modulos } };
}

export function contasDoModulo(visao, moduloId) {
  const contas = visao?.modulos?.[moduloId];
  return Array.isArray(contas) ? contas : [];
}

export function definirContasDoModulo(visao, moduloId, contasIds) {
  return {
    ...visao,
    modulos: { ...visao.modulos, [moduloId]: [...contasIds] },
  };
}

export function moduloConfigurado(visao, moduloId) {
  return contasDoModulo(visao, moduloId).length > 0;
}

// Módulos que a visão realmente orça. Um módulo sem conta selecionada não
// entra: não há o que somar.
export function modulosDaVisao(visao) {
  return MODULOS.filter((item) => moduloConfigurado(visao, item.id));
}

export function resumoDaVisao(visao) {
  const configurados = modulosDaVisao(visao);
  const contas = configurados.reduce(
    (total, item) => total + contasDoModulo(visao, item.id).length,
    0
  );
  return { modulos: configurados.length, totalDeModulos: MODULOS.length, contas };
}
