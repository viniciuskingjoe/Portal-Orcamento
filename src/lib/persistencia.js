import { criarPlano } from "../dados/plano.js";
import { criarVisao } from "../dados/visao.js";
import { configuracaoInicial } from "../dados/configuracao.js";
import { VISOES_SEED } from "../dados/seeds.js";

// Persistência local, suficiente enquanto o backend não serve os dados.
// Ao plugar a API, este módulo vira a camada de fetch/save e o resto do app
// continua igual — nada fora daqui conhece o localStorage.
//
// v3: filiais e centros de custo saíram de dentro do plano e viraram
// configuração global. O que estava na v2 é migrado, não descartado.
const CHAVE = "portal-orcamento:estado:v3";
const CHAVE_V2 = "portal-orcamento:estado:v2";

export function estadoInicial() {
  const visoes = VISOES_SEED.map((item) => criarVisao(item.id, item.nome, item.modulos));
  const visaoId = visoes[0]?.id ?? null;
  return {
    configuracao: configuracaoInicial(),
    visoes,
    planos: [
      criarPlano("oficial", "Oficial", 2024, 2026, visaoId),
      criarPlano("reajustado", "Orçamento 2024-2026 - Reajustado", 2024, 2026, visaoId),
    ],
  };
}

function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
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
    Number.isInteger(plano.fim)
  );
}

// Remove filiais/centros que ficaram no plano na v2 — a partir da v3 eles vivem
// só na configuração global.
function normalizarPlano({ filiais: _f, centros: _c, ...plano }) {
  return { ...plano, visaoId: plano.visaoId ?? null, planejado: plano.planejado ?? {} };
}

function normalizarConfiguracao(bruta) {
  const lista = (valor) =>
    Array.isArray(valor)
      ? valor.filter((item) => item && typeof item.id === "string" && typeof item.nome === "string")
      : [];
  const filiais = lista(bruta?.filiais);
  const centros = lista(bruta?.centros);
  return { filiais, centros };
}

// União por id: na v2 cada plano tinha sua cópia da lista, e elas podiam ter
// divergido. Perder uma filial que só existia em um plano apagaria as edições
// ligadas a ela.
function configuracaoDosPlanos(planos) {
  const juntar = (campo) => {
    const porId = new Map();
    planos.forEach((plano) => {
      (Array.isArray(plano?.[campo]) ? plano[campo] : []).forEach((item) => {
        if (item && typeof item.id === "string" && !porId.has(item.id)) porId.set(item.id, item);
      });
    });
    return [...porId.values()];
  };
  return { filiais: juntar("filiais"), centros: juntar("centros") };
}

function montar(dados) {
  return {
    configuracao: normalizarConfiguracao(dados.configuracao),
    visoes: dados.visoes.filter(visaoValida).map(normalizarVisao),
    planos: dados.planos.filter(planoValido).map(normalizarPlano),
  };
}

export function carregarEstado() {
  const bruto = ler(CHAVE);
  if (bruto) {
    try {
      const dados = JSON.parse(bruto);
      if (dados && Array.isArray(dados.planos) && Array.isArray(dados.visoes)) {
        // Listas vazias são estado legítimo: o usuário excluiu tudo.
        return montar(dados);
      }
    } catch {
      /* cai para o estado inicial */
    }
    return estadoInicial();
  }

  const brutoV2 = ler(CHAVE_V2);
  if (brutoV2) {
    try {
      const dados = JSON.parse(brutoV2);
      if (dados && Array.isArray(dados.planos) && Array.isArray(dados.visoes)) {
        return montar({ ...dados, configuracao: configuracaoDosPlanos(dados.planos) });
      }
    } catch {
      /* cai para o estado inicial */
    }
  }

  return estadoInicial();
}

export function salvarEstado(estado) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: String(erro?.name ?? erro) };
  }
}
