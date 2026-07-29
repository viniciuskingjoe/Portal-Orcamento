import { criarPlanosIniciais } from "../dados/plano.js";

const CHAVE = "portal-orcamento:planos:v1";

// Persistência local, suficiente enquanto o protótipo não tem backend.
// Ao plugar a API, este módulo vira a camada de fetch/save e o resto do app
// continua igual — nada fora daqui conhece o localStorage.

function planoValido(plano) {
  return (
    plano &&
    typeof plano.id === "string" &&
    typeof plano.nome === "string" &&
    Number.isInteger(plano.inicio) &&
    Number.isInteger(plano.fim) &&
    Array.isArray(plano.filiais) &&
    Array.isArray(plano.centros) &&
    Array.isArray(plano.canais) &&
    Array.isArray(plano.deducoes)
  );
}

function normalizar(plano) {
  return {
    ...plano,
    planejado: plano.planejado ?? {},
    pctPlanejado: plano.pctPlanejado ?? {},
    canais: plano.canais.map((canal) => ({
      ...canal,
      contas: canal.contas ?? [],
      bases: canal.bases ?? { vendas: 0, operacionais: 0 },
    })),
    deducoes: plano.deducoes.map((deducao) => ({
      ...deducao,
      contas: deducao.contas ?? [],
      percentualBase: deducao.percentualBase ?? 0,
    })),
  };
}

export function carregarPlanos() {
  let bruto = null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch {
    return criarPlanosIniciais();
  }
  if (!bruto) return criarPlanosIniciais();

  try {
    const dados = JSON.parse(bruto);
    if (!Array.isArray(dados)) return criarPlanosIniciais();
    // Uma lista vazia é um estado legítimo: o usuário excluiu todos os planos.
    return dados.filter(planoValido).map(normalizar);
  } catch {
    return criarPlanosIniciais();
  }
}

export function salvarPlanos(planos) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(planos));
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: String(erro?.name ?? erro) };
  }
}
