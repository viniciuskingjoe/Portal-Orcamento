// Normalização do estado do portal e leitura do localStorage LEGADO.
//
// O estado agora vive no banco (ver lib/estado.js). Este arquivo continua por
// dois motivos:
//
//   1. `normalizarEstado` vale para o que vem da API também — linha estranha no
//      banco não pode virar NaN numa soma de dinheiro;
//   2. `lerEstadoLegado` lê o que ficou gravado no navegador antes da migração,
//      para o portal oferecer a importação uma única vez.
//
// Filiais, centros de custo, plano de contas e realizado NÃO passam por aqui —
// vêm do ERP a cada carga.
//
// A migração para o SQL Server foi feita: as tabelas estão em sql/003 e o
// acesso, em lib/estado.js. A chave usada aqui (`modulo|filial|centro|conta|mes`)
// virou as colunas de KING_PORTAL_ORC_PLANEJADO — a troca foi de camada, não de
// modelo.
const CHAVE = "portal-orcamento:estado:v5";

export function estadoInicial() {
  // `filiaisAtivas: null` = ainda não escolhidas, o que vale por "todas". Lista
  // vazia é diferente: significa que o usuário desmarcou todas de propósito.
  return { configuracao: { filiaisAtivas: null }, visoes: [], planos: [] };
}

function listaDeTexto(valor) {
  return Array.isArray(valor) ? valor.filter((item) => typeof item === "string") : [];
}

function normalizarSinais(bruto) {
  const sinais = {};
  Object.entries(bruto ?? {}).forEach(([codigo, tipo]) => {
    if (tipo === "receita" || tipo === "despesa") sinais[codigo] = tipo;
  });
  return sinais;
}

function normalizarConfiguracao(bruta) {
  const filiais = bruta?.filiaisAtivas;
  return { filiaisAtivas: Array.isArray(filiais) ? listaDeTexto(filiais) : null };
}

function visaoValida(visao) {
  return visao && typeof visao.id === "string" && typeof visao.nome === "string";
}

function normalizarVisao(visao) {
  const modulos = {};

  Object.entries(visao.modulos ?? {}).forEach(([moduloId, bruto]) => {
    const usaCentro = bruto?.usaCentro === true;
    const filiais = {};

    Object.entries(bruto?.filiais ?? {}).forEach(([filialId, daFilial]) => {
      // Centro vazio é estado legítimo: foi marcado como em uso e as contas
      // ainda não. Descartá-lo aqui apagaria a marcação a cada recarga.
      const centros = {};
      Object.entries(daFilial?.centros ?? {}).forEach(([centroId, doCentro]) => {
        centros[centroId] = listaDeTexto(doCentro);
      });

      // Mesma regra de dados/visao.js: com centro, a lista da filial é o
      // consolidado. Recalcular na leitura também conserta gravação antiga.
      const contas = usaCentro
        ? [...new Set(Object.values(centros).flat())].sort()
        : listaDeTexto(daFilial?.contas);

      filiais[filialId] = { contas, centros };
    });

    modulos[moduloId] = {
      usaCentro,
      // Sinal definido à mão, conta a conta. Só receita/despesa entram.
      sinais: normalizarSinais(bruto?.sinais),
      filiais,
    };
  });

  return {
    id: visao.id,
    nome: visao.nome,
    visaoContabil: typeof visao.visaoContabil === "string" ? visao.visaoContabil : null,
    modulos,
  };
}

function planoValido(plano) {
  return (
    plano &&
    typeof plano.id === "string" &&
    typeof plano.nome === "string" &&
    Number.isInteger(plano.ano)
  );
}

function normalizarPlano(plano) {
  const planejado = {};
  Object.entries(plano.planejado ?? {}).forEach(([chave, valor]) => {
    // Descarta valor não numérico: uma string aqui viraria NaN na soma e
    // contaminaria a coluna inteira.
    if (Number.isFinite(valor)) planejado[chave] = valor;
  });
  return {
    id: plano.id,
    nome: plano.nome,
    ano: plano.ano,
    visaoId: plano.visaoId ?? null,
    planejado,
  };
}

// Aplica as mesmas regras a qualquer origem: API ou localStorage.
export function normalizarEstado(dados) {
  if (!dados || !Array.isArray(dados.planos) || !Array.isArray(dados.visoes)) {
    return estadoInicial();
  }
  // Listas vazias são estado legítimo: o usuário excluiu tudo.
  return {
    configuracao: normalizarConfiguracao(dados.configuracao),
    visoes: dados.visoes.filter(visaoValida).map(normalizarVisao),
    planos: dados.planos.filter(planoValido).map(normalizarPlano),
  };
}

// O que sobrou no navegador de antes da migração. `null` quando não há nada.
export function lerEstadoLegado() {
  let bruto = null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
  if (!bruto) return null;

  try {
    const dados = normalizarEstado(JSON.parse(bruto));
    return dados.visoes.length || dados.planos.length ? dados : null;
  } catch {
    return null;
  }
}

// Some com o legado depois de importado, para o portal não oferecer de novo.
export function descartarEstadoLegado() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // Navegador sem localStorage: não há legado para descartar.
  }
}
