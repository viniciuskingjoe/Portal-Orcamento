// Estado que pertence ao portal (visões e valores planejados) e ainda não tem
// tabela própria no banco. Filiais, centros de custo, plano de contas e
// realizado NÃO passam por aqui: vêm do ERP a cada carga.
//
// v4: os ids mudaram de origem. Filial era "akr", agora é o COD_FILIAL do ERP
// ("000001"); conta era "3.1.1.01.001", agora é a classificação da visão
// ("3.1.1.1.02"). Nada gravado antes casa com os dados reais, então não há
// migração — as chaves antigas seriam órfãs.
const CHAVE = "portal-orcamento:estado:v4";

export function estadoInicial() {
  return { visoes: [], planos: [] };
}

function visaoValida(visao) {
  return visao && typeof visao.id === "string" && typeof visao.nome === "string";
}

function normalizarVisao(visao) {
  const modulos = {};
  Object.entries(visao.modulos ?? {}).forEach(([moduloId, contas]) => {
    if (Array.isArray(contas)) modulos[moduloId] = contas;
  });
  return { id: visao.id, nome: visao.nome, modulos };
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

function normalizarPlano(plano) {
  const planejado = {};
  Object.entries(plano.planejado ?? {}).forEach(([chave, valor]) => {
    // Descarta valor não numérico: uma string aqui viraria "NaN" na soma e
    // contaminaria a coluna inteira.
    if (Number.isFinite(valor)) planejado[chave] = valor;
  });
  return {
    id: plano.id,
    nome: plano.nome,
    inicio: plano.inicio,
    fim: plano.fim,
    visaoId: plano.visaoId ?? null,
    planejado,
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
