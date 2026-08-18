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

// Só Despesas com pessoal: fixa (sem entrada) ou calculada (expressão salva
// aqui). Mesmo molde de `normalizarSinais` — cai fora se não tiver o formato
// esperado, em vez de propagar lixo para o avaliador de fórmula.
function normalizarFormulas(bruto) {
  const formulas = {};
  Object.entries(bruto ?? {}).forEach(([codigo, formula]) => {
    const expressao = formula?.expressao;
    if (typeof expressao === "string" && expressao.trim()) {
      formulas[codigo] = { expressao };
    }
  });
  return formulas;
}

// Contas escolhidas numa linha "modulo", cada uma com o próprio sinal — cai
// fora item sem código ou com sinal fora de 1/-1, mesmo espírito das demais
// funções deste arquivo.
function normalizarValoresDaLinha(bruto) {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((item) => item && typeof item.codigo === "string" && item.codigo.trim())
    .map((item) => ({ codigo: item.codigo, sinal: item.sinal === -1 ? -1 : 1 }));
}

// Linhas do DRE, por visão. Mesmo espírito de `normalizarFormulas`: cai fora
// do que não tem o formato mínimo, em vez de propagar lixo para a tela ou
// para o avaliador de fórmula entre linhas.
function normalizarDreLinhas(bruto) {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter(
      (linha) =>
        linha &&
        typeof linha.id === "string" &&
        typeof linha.titulo === "string" &&
        (linha.origem === "modulo" || linha.origem === "formula")
    )
    .map((linha, indice) => ({
      id: linha.id,
      ordem: Number.isFinite(linha.ordem) ? linha.ordem : indice,
      titulo: linha.titulo,
      origem: linha.origem,
      moduloId: linha.origem === "modulo" && typeof linha.moduloId === "string" ? linha.moduloId : null,
      sinal: linha.origem === "modulo" && (linha.sinal === 1 || linha.sinal === -1) ? linha.sinal : null,
      valores: linha.origem === "modulo" ? normalizarValoresDaLinha(linha.valores) : [],
      formula:
        linha.origem === "formula" && typeof linha.formula === "string" && linha.formula.trim()
          ? linha.formula
          : null,
      mostra: linha.mostra !== false,
      destaca: linha.destaca === true,
      baseAnaliseVertical: linha.baseAnaliseVertical === true,
      linhaPrincipal: linha.linhaPrincipal === true,
      unidade: linha.unidade === "percentual" ? "percentual" : "moeda",
    }));
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
      // Fixa vs. calculada, só em Despesas com pessoal — mas o formato é
      // genérico, então normaliza para todo módulo do mesmo jeito que sinais.
      formulas: normalizarFormulas(bruto?.formulas),
      filiais,
    };
  });

  return {
    id: visao.id,
    nome: visao.nome,
    visaoContabil: typeof visao.visaoContabil === "string" ? visao.visaoContabil : null,
    modulos,
    dreLinhas: normalizarDreLinhas(visao.dreLinhas),
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

  // Mapa à parte do planejado — gente não é dinheiro. Mesma checagem de
  // número finito; `null` (célula apagada) nunca chega aqui porque o backend
  // já DELETA a linha em vez de gravar nula.
  const funcionarios = {};
  Object.entries(plano.funcionarios ?? {}).forEach(([chave, valor]) => {
    if (Number.isFinite(valor)) funcionarios[chave] = valor;
  });

  return {
    id: plano.id,
    nome: plano.nome,
    ano: plano.ano,
    visaoId: plano.visaoId ?? null,
    planejado,
    funcionarios,
    // Sem situação/publicação (banco no sql/003 ou 004 só, antes do sql/005),
    // os valores abaixo são a mesma leitura que o backend já dá nesse caso:
    // todo plano ativo, nunca publicado.
    situacao: plano.situacao === "inativo" ? "inativo" : "ativo",
    idOrcamento: plano.idOrcamento ?? null,
    publicadoEm: plano.publicadoEm ?? null,
    publicadoLinhas: plano.publicadoLinhas ?? null,
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
