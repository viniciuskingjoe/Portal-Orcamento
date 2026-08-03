import { SEM_CENTRO } from "./visao.js";

// ============================================================================
// PERMISSÃO
//
// A sessão traz o que o usuário pode neste portal:
//
//   { login, nome, admin, acessos: [ { modulo, filial, centro, podeEditar } ] }
//
// Cada acesso é uma CONCESSÃO, e `null` em qualquer dimensão significa TODOS
// dela. As linhas somam — vale a mais permissiva:
//
//   { modulo: null, filial: null,     centro: null,  podeEditar: true  }  tudo
//   { modulo: null, filial: null,     centro: "020", podeEditar: true  }  só o centro 020
//   { modulo: "receita-vendas", filial: null, centro: null, podeEditar: false }  vê a receita
//   { modulo: null, filial: "000025", centro: null,  podeEditar: true  }  só a filial
//
// A linha EXISTIR já dá o direito de ver; `podeEditar` diz se também lança.
//
// MÓDULO SEM CENTRO DE CUSTO
// Receita de vendas não tem a dimensão centro, e a tela consulta com
// `centro: SEM_CENTRO`. Uma concessão presa a um centro NÃO casa com isso —
// de propósito: quem só cuida do e-commerce não deveria ganhar a receita da
// empresa de brinde. Para ele ver a receita (que é a base do percentual em
// Deduções e Custos) o administrador concede a linha explícita, como a terceira
// do exemplo. Sem ela o percentual fica sem base e a coluna em reais zera.
// ============================================================================

export const SESSAO_VAZIA = { login: null, nome: null, admin: false, acessos: [] };

// `undefined` no alvo = a pergunta não fixou essa dimensão ("existe algum acesso
// que envolva esta filial, em qualquer módulo?"). Diferente de `SEM_CENTRO`, que
// é uma dimensão fixada no valor "nenhum centro".
function combina(doAcesso, alvo) {
  if (doAcesso == null) return true;
  if (alvo === undefined) return true;
  return doAcesso === alvo;
}

function casa(acesso, alvo) {
  return (
    combina(acesso.modulo, alvo.modulo) &&
    combina(acesso.filial, alvo.filial) &&
    combina(acesso.centro, alvo.centro)
  );
}

function acessos(sessao) {
  return Array.isArray(sessao?.acessos) ? sessao.acessos : [];
}

export function ehAdmin(sessao) {
  return sessao?.admin === true;
}

export function podeVer(sessao, alvo = {}) {
  if (ehAdmin(sessao)) return true;
  return acessos(sessao).some((acesso) => casa(acesso, alvo));
}

export function podeEditar(sessao, alvo = {}) {
  if (ehAdmin(sessao)) return true;
  return acessos(sessao).some((acesso) => acesso.podeEditar === true && casa(acesso, alvo));
}

// --------------------------------------------------------------------------
// Recortes para a tela
//
// Filtram listas que hoje vêm inteiras do ERP. Mostrar o que não se pode ver já
// é vazamento: o nome das filiais e dos centros diz o tamanho da operação.
// --------------------------------------------------------------------------

export function filiaisPermitidas(sessao, filiais, alvo = {}) {
  if (ehAdmin(sessao)) return filiais ?? [];
  return (filiais ?? []).filter((filial) => podeVer(sessao, { ...alvo, filial: filial.id }));
}

// O módulo é obrigatório: a lista de centros só existe dentro de um. Sem fixá-lo,
// uma concessão de OUTRO módulo que não restringe centro (por exemplo "ver
// receita de vendas") liberaria todos os centros aqui.
export function centrosPermitidos(sessao, centros, alvo = {}) {
  if (ehAdmin(sessao)) return centros ?? [];
  if (alvo.modulo === undefined) return [];
  return (centros ?? []).filter((centro) => podeVer(sessao, { ...alvo, centro: centro.id }));
}

export function modulosPermitidos(sessao, modulos) {
  if (ehAdmin(sessao)) return modulos ?? [];
  return (modulos ?? []).filter((modulo) => podeVer(sessao, { modulo: modulo.id }));
}

// --------------------------------------------------------------------------
// Escopo em texto, para a tela dizer o que está sendo mostrado.
//
// Sem isto o usuário de um centro vê um DRE que não bate com o da empresa e
// reporta como erro de cálculo — o número está certo, o recorte é que é dele.
// --------------------------------------------------------------------------

export function resumirEscopo(sessao, { filiais, centros } = {}) {
  if (ehAdmin(sessao)) return null;

  const lista = acessos(sessao);
  if (!lista.length) return "sem acesso";

  // Uma concessão irrestrita torna qualquer outra redundante.
  if (lista.some((acesso) => !acesso.modulo && !acesso.filial && !acesso.centro)) return null;

  const nomes = (colecao, ids) =>
    [...ids].map((id) => (colecao ?? []).find((item) => item.id === id)?.nome ?? id);

  const partes = [];
  const porCentro = new Set(lista.map((a) => a.centro).filter(Boolean));
  const porFilial = new Set(lista.map((a) => a.filial).filter(Boolean));

  if (porFilial.size) partes.push(nomes(filiais, porFilial).join(", "));
  if (porCentro.size) partes.push(nomes(centros, porCentro).join(", "));

  return partes.length ? partes.join(" · ") : null;
}

// --------------------------------------------------------------------------
// Onde a tela do plano pode lançar
//
// Reúne as três perguntas que TelaOrcamento já faz (filial escolhida, centro
// escolhido, conta escolhida) numa só, para a checagem de permissão não ficar
// espalhada por lá.
// --------------------------------------------------------------------------

export function podeLancar(sessao, { modulo, filial, centro, usaCentro }) {
  if (!filial || filial === "total") return false;
  if (usaCentro && (!centro || centro === SEM_CENTRO)) return false;
  return podeEditar(sessao, { modulo, filial, centro: usaCentro ? centro : SEM_CENTRO });
}
