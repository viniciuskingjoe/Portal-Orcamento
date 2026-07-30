import { mesTemRealizado } from "./calendario.js";

// ============================================================================
// MOCK DETERMINÍSTICO
//
// Substituir este arquivo pelas consultas ao banco. Os pontos de entrada usados
// pelo resto do app são apenas `gerarPlanejado` e `gerarRealizado`.
// ============================================================================

const ANO_REFERENCIA = 2024;
const CRESCIMENTO_ANUAL = 1.075;

const SAZONALIDADE = [0.82, 0.88, 0.97, 0.94, 1.01, 1.04, 1.08, 1.02, 1.06, 1.13, 1.28, 1.42];

function hashDeterministico(texto) {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function ruido(chave, amplitude = 0.08) {
  return 1 + (((hashDeterministico(chave) % 2001) / 1000) - 1) * amplitude;
}

function fatorSazonal(mes) {
  return SAZONALIDADE[mes - 1] ?? 1;
}

// `modulo` é o item de dados/modulos.js e `filial` o objeto do plano. Os
// parâmetros do mock vêm deles, então uma filial criada pela tela (fator 0)
// gera 0 tanto em planejado quanto em realizado, sem divergir entre os dois.
export function gerarPlanejado(modulo, filial, ano, mes) {
  const base = modulo?.base ?? 0;
  const fator = filial?.fator ?? 0;
  if (!base || !fator) return 0;
  const crescimento = Math.pow(CRESCIMENTO_ANUAL, ano - ANO_REFERENCIA);
  const valor =
    base *
    fator *
    fatorSazonal(mes) *
    crescimento *
    ruido(`plan|${modulo.id}|${filial.id}|${ano}|${mes}`, 0.055);
  return Math.round(valor / 100) * 100;
}

export function gerarRealizado(modulo, filial, ano, mes, ehAnoAnterior = false) {
  const anoReferencia = ehAnoAnterior ? ano - 1 : ano;
  if (!mesTemRealizado(anoReferencia, mes)) return 0;
  const base = gerarPlanejado(modulo, filial, anoReferencia, mes);
  if (!base) return 0;
  const chave = `real|${modulo.id}|${filial.id}|${anoReferencia}|${mes}`;
  return Math.round((base * ruido(chave, 0.115)) / 100) * 100;
}
