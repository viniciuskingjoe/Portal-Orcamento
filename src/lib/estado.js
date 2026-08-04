import { api } from "./api.js";
import { normalizarEstado } from "./persistencia.js";

// ============================================================================
// ESTADO DO PORTAL
//
// Visões, planos e planejado vêm do banco pela API. Antes viviam no
// localStorage, onde qualquer pessoa editava o próprio orçamento pelo DevTools
// e nenhuma permissão fazia sentido.
//
// As gravações são POR OPERAÇÃO, não do estado inteiro: a visão de um módulo
// tem até 383 contas por filial, e mandar tudo a cada tecla seria dezenas de
// milhares de linhas por clique.
//
// A tela segue otimista — aplica a mudança local e grava em seguida. Quem
// digita doze meses seguidos não pode esperar ida e volta a cada tecla; se a
// gravação falhar, o aviso aparece e o valor da tela deixa de valer.
// ============================================================================

export async function carregarEstado() {
  // Normaliza o que veio da API pelas mesmas regras do localStorage: linha
  // estranha no banco não pode virar NaN numa soma de dinheiro.
  return normalizarEstado(await api.estado());
}

export const estado = {
  importar: (dados) => api.importarEstado(dados),

  configuracao: (chave, valor) => api.salvarConfiguracao(chave, valor),

  visao: {
    salvar: (visao) => api.salvarVisao(visao),
    excluir: (id) => api.excluirVisao(id),
    contas: (visaoId, modulo, filial, centro, contas) =>
      api.salvarModulo(visaoId, modulo, { filial, centro: centro ?? "", contas }),
    contasEmLote: (visaoId, modulo, lotes) => api.salvarModulo(visaoId, modulo, { lotes }),
    usoDoCentro: (visaoId, modulo, filial, centro, usa) =>
      api.salvarModulo(visaoId, modulo, { filial, centro, usoDoCentro: usa }),
    sinal: (visaoId, modulo, conta, tipo) =>
      api.salvarModulo(visaoId, modulo, { sinal: { conta, tipo } }),
  },

  plano: {
    salvar: (plano) => api.salvarPlano(plano),
    excluir: (id) => api.excluirPlano(id),
    planejado: (planoId, celulas) => api.salvarPlanejado(planoId, celulas),
  },
};

// A chave do planejado é `modulo|filial|centro|conta|mes[|receita]`. A API
// recebe os campos separados, então o que a tela monta como chave precisa ser
// desmontado aqui — é o único lugar que sabe o formato dos dois lados.
export function celulaDaChave(chave, valor) {
  const [modulo, filial, centro, conta, mes, receita] = chave.split("|");
  return {
    modulo,
    filial,
    centro: centro ?? "",
    conta,
    receita: receita ?? "",
    mes: Number(mes),
    valor,
  };
}
