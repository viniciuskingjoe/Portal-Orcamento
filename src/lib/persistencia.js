// Estado que pertence ao portal: visões, planos, valores planejados e quais
// filiais aparecem. Filiais, centros de custo, plano de contas e realizado NÃO
// passam por aqui — vêm do ERP a cada carga.
//
// PLANO DE MIGRAÇÃO PARA O SQL SERVER
// Quando sair do localStorage, o desenho previsto é (prefixo KING_PORTAL_ para
// não se confundir com tabela do ERP, conforme PADRAO §5):
//
//   KING_PORTAL_CONFIGURACAO   (CHAVE, VALOR)                     filiais ativas
//   KING_PORTAL_VISAO          (ID, NOME, VISAO_CONTABIL)
//   KING_PORTAL_VISAO_MODULO   (VISAO_ID, MODULO, USA_CENTRO)
//   KING_PORTAL_VISAO_CONTA    (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO,
//                               CLASSIFICACAO)
//   KING_PORTAL_PLANO          (ID, NOME, ANO, VISAO_ID)
//   KING_PORTAL_PLANEJADO      (PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO,
//                               CLASSIFICACAO, MES, VALOR)
//
// As chaves aqui (`modulo|filial|centro|conta|mes`) já são as colunas dessa
// última tabela, então a troca é de camada, não de modelo. Só este arquivo muda:
// vira fetch/save contra rotas novas da API.
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
    const filiais = {};
    Object.entries(bruto?.filiais ?? {}).forEach(([filialId, daFilial]) => {
      const contas = listaDeTexto(daFilial?.contas);
      const permitidas = new Set(contas);

      const centros = {};
      Object.entries(daFilial?.centros ?? {}).forEach(([centroId, doCentro]) => {
        // O centro é subconjunto da filial; sobra vinda de gravação antiga sai.
        const validas = listaDeTexto(doCentro).filter((codigo) => permitidas.has(codigo));
        if (validas.length) centros[centroId] = validas;
      });

      filiais[filialId] = { contas, centros };
    });

    modulos[moduloId] = {
      usaCentro: bruto?.usaCentro === true,
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
      configuracao: normalizarConfiguracao(dados.configuracao),
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
