import { criarPlano } from "../dados/plano.js";
import { criarVisao } from "../dados/visao.js";
import { VISOES_SEED } from "../dados/seeds.js";

// Persistência local, suficiente enquanto o backend não está no ar.
// Ao plugar a API, este módulo vira a camada de fetch/save e o resto do app
// continua igual — nada fora daqui conhece o localStorage.
//
// v2: o modelo mudou (canais e deduções saíram, entraram visões). Dados
// gravados na v1 não têm equivalente e são ignorados.
const CHAVE = "portal-orcamento:estado:v2";

export function estadoInicial() {
  const visoes = VISOES_SEED.map((item) => criarVisao(item.id, item.nome, item.modulos));
  return {
    visoes,
    planos: [
      criarPlano("oficial", "Oficial", 2024, 2026, visoes[0]?.id ?? null),
      criarPlano("reajustado", "Orçamento 2024-2026 - Reajustado", 2024, 2026, visoes[0]?.id ?? null),
    ],
  };
}

function visaoValida(visao) {
  return visao && typeof visao.id === "string" && typeof visao.nome === "string";
}

function normalizarVisao(visao) {
  const modulos = {};
  Object.entries(visao.modulos ?? {}).forEach(([moduloId, contas]) => {
    if (Array.isArray(contas)) modulos[moduloId] = contas;
  });
  return { ...visao, modulos };
}

function planoValido(plano) {
  return (
    plano &&
    typeof plano.id === "string" &&
    typeof plano.nome === "string" &&
    Number.isInteger(plano.inicio) &&
    Number.isInteger(plano.fim) &&
    Array.isArray(plano.filiais) &&
    Array.isArray(plano.centros)
  );
}

function normalizarPlano(plano) {
  return {
    ...plano,
    visaoId: plano.visaoId ?? null,
    planejado: plano.planejado ?? {},
  };
}

export function carregarEstado() {
  let bruto = null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch {
    return estadoInicial();
  }
  if (!bruto) return estadoInicial();

  try {
    const dados = JSON.parse(bruto);
    if (!dados || !Array.isArray(dados.planos) || !Array.isArray(dados.visoes)) {
      return estadoInicial();
    }
    // Listas vazias são estado legítimo: o usuário excluiu tudo.
    return {
      visoes: dados.visoes.filter(visaoValida).map(normalizarVisao),
      planos: dados.planos.filter(planoValido).map(normalizarPlano),
    };
  } catch {
    return estadoInicial();
  }
}

export function salvarEstado(estado) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: String(erro?.name ?? erro) };
  }
}
