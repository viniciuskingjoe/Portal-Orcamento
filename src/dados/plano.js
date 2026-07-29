import {
  CANAIS_SEED,
  CENTROS_SEED,
  DEDUCOES_SEED,
  FILIAIS_SEED,
  MESES,
} from "./seeds.js";
import {
  gerarPercentualPlanejado,
  gerarPercentualRealizado,
  gerarPlanejado,
  gerarRealizado,
} from "./mock.js";
import { mesTemRealizado } from "./calendario.js";

// ============================================================================
// MODELO DO PLANO
//
// `plano.planejado` e `plano.pctPlanejado` guardam SOMENTE as edições manuais.
// Quando não há edição para uma célula, o valor vem do gerador. Isso mantém
// dimensões novas coerentes (parâmetro 0 -> planejado 0 e realizado 0) e deixa
// o plano pequeno o bastante para caber no localStorage.
// ============================================================================

export function gerarId(prefixo) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function chavePlanejado(modulo, filialId, canalId, ano, mes) {
  return `${modulo}|${filialId}|${canalId}|${ano}|${mes}`;
}

export function chavePercentual(filialId, canalId, deducaoId, ano, mes) {
  return `${filialId}|${canalId}|${deducaoId}|${ano}|${mes}`;
}

export function criarPlano(id, nome, inicio, fim) {
  return {
    id,
    nome,
    inicio,
    fim,
    filiais: FILIAIS_SEED.map((item) => ({ ...item })),
    centros: CENTROS_SEED.map((item) => ({ ...item })),
    canais: CANAIS_SEED.map((item) => ({ ...item, contas: [...item.contas], bases: { ...item.bases } })),
    deducoes: DEDUCOES_SEED.map((item) => ({ ...item, contas: [...item.contas] })),
    planejado: {},
    pctPlanejado: {},
  };
}

export function criarPlanosIniciais() {
  return [
    criarPlano("orcamento-reajustado", "Orçamento 2024-2026 - Reajustado", 2024, 2026),
    criarPlano("oficial", "Oficial", 2024, 2026),
  ];
}

export function anosDoPlano(plano) {
  return Array.from({ length: plano.fim - plano.inicio + 1 }, (_, i) => plano.inicio + i);
}

// "total" seleciona a lista inteira; caso contrário, o item correspondente.
function itensSelecionados(lista, idSelecionado) {
  if (idSelecionado === "total") return lista;
  const item = lista.find((entry) => entry.id === idSelecionado);
  return item ? [item] : [];
}

function planejadoDaCelula(plano, modulo, filial, canal, ano, mes) {
  const editado = plano.planejado[chavePlanejado(modulo, filial.id, canal.id, ano, mes)];
  return editado ?? gerarPlanejado(modulo, filial, canal, ano, mes);
}

function percentualDaCelula(plano, filial, canal, deducao, ano, mes) {
  const editado = plano.pctPlanejado[chavePercentual(filial.id, canal.id, deducao.id, ano, mes)];
  return editado ?? gerarPercentualPlanejado(filial, canal, deducao, ano, mes);
}

function somarMes(plano, modulo, filiais, canais, ano, mes) {
  let planejado = 0;
  let realizado = 0;
  let anterior = 0;
  filiais.forEach((filial) => {
    canais.forEach((canal) => {
      planejado += planejadoDaCelula(plano, modulo, filial, canal, ano, mes);
      realizado += gerarRealizado(modulo, filial, canal, ano, mes, false);
      anterior += gerarRealizado(modulo, filial, canal, ano, mes, true);
    });
  });
  return { planejado, realizado, anterior };
}

function obterDeducaoMes(plano, filiais, canais, deducoes, ano, mes) {
  const acumulado = {
    receitaPlan: 0,
    receitaReal: 0,
    receitaAnterior: 0,
    valorPlan: 0,
    valorReal: 0,
    valorAnterior: 0,
  };

  filiais.forEach((filial) => {
    canais.forEach((canal) => {
      const planReceita = planejadoDaCelula(plano, "vendas", filial, canal, ano, mes);
      const realReceita = gerarRealizado("vendas", filial, canal, ano, mes, false);
      const anteriorReceita = gerarRealizado("vendas", filial, canal, ano, mes, true);

      let pctPlan = 0;
      let pctReal = 0;
      let pctAnterior = 0;
      deducoes.forEach((deducao) => {
        pctPlan += percentualDaCelula(plano, filial, canal, deducao, ano, mes);
        pctReal += gerarPercentualRealizado(filial, canal, deducao, ano, mes, false);
        pctAnterior += gerarPercentualRealizado(filial, canal, deducao, ano, mes, true);
      });

      acumulado.receitaPlan += planReceita;
      acumulado.receitaReal += realReceita;
      acumulado.receitaAnterior += anteriorReceita;
      acumulado.valorPlan += planReceita * (pctPlan / 100);
      acumulado.valorReal += realReceita * (pctReal / 100);
      acumulado.valorAnterior += anteriorReceita * (pctAnterior / 100);
    });
  });

  return {
    ...acumulado,
    pctPlan: acumulado.receitaPlan ? (acumulado.valorPlan / acumulado.receitaPlan) * 100 : 0,
    pctReal: acumulado.receitaReal ? (acumulado.valorReal / acumulado.receitaReal) * 100 : 0,
    pctAnterior: acumulado.receitaAnterior
      ? (acumulado.valorAnterior / acumulado.receitaAnterior) * 100
      : 0,
  };
}

function calcularVariacao(realizado, anterior) {
  const variacao = realizado - anterior;
  return {
    variacao,
    variacaoPercentual: anterior ? (variacao / Math.abs(anterior)) * 100 : 0,
  };
}

// A média divide pelos meses que realmente têm dado, não por 12 fixo. Com 12
// fixo a média de realizado ficava diluída pelos meses que ainda nem chegaram.
function linhaMedia(meses, ano, rotulo = "Média") {
  const comRealizado = MESES.filter((mes) => mesTemRealizado(ano, mes)).length;
  const comAnterior = MESES.filter((mes) => mesTemRealizado(ano - 1, mes)).length;
  const somar = (campo) => meses.reduce((total, linha) => total + linha[campo], 0);

  const media = {
    id: "media",
    label: rotulo,
    planejado: somar("planejado") / 12,
    realizado: comRealizado ? somar("realizado") / comRealizado : 0,
    anterior: comAnterior ? somar("anterior") / comAnterior : 0,
    nota: `Planejado ÷ 12 · Realizado ÷ ${comRealizado || 0} · Ano anterior ÷ ${comAnterior || 0} (meses com dado)`,
  };
  Object.assign(media, calcularVariacao(media.realizado, media.anterior));
  return media;
}

export function criarLinhasOrcamento(plano, modulo, filialId, canalId, ano) {
  const filiais = itensSelecionados(plano.filiais, filialId);
  const canais = itensSelecionados(plano.canais, canalId);

  const meses = MESES.map((mes) => {
    const valores = somarMes(plano, modulo, filiais, canais, ano, mes);
    return {
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      ...valores,
      ...calcularVariacao(valores.realizado, valores.anterior),
    };
  });

  const somar = (campo) => meses.reduce((total, linha) => total + linha[campo], 0);
  const total = {
    id: "total",
    label: "Total",
    planejado: somar("planejado"),
    realizado: somar("realizado"),
    anterior: somar("anterior"),
  };
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  return [...meses, total, linhaMedia(meses, ano)];
}

export function criarLinhasDeducao(plano, filialId, canalId, deducaoId, ano, aba) {
  const filiais = itensSelecionados(plano.filiais, filialId);
  const canais = itensSelecionados(plano.canais, canalId);
  const deducoes = itensSelecionados(plano.deducoes, deducaoId);
  const ehPercentual = aba === "percentual";

  const dadosMensais = MESES.map((mes) =>
    obterDeducaoMes(plano, filiais, canais, deducoes, ano, mes)
  );

  const meses = dadosMensais.map((dados, index) => {
    const linha = {
      id: index + 1,
      label: `${String(index + 1).padStart(2, "0")}/${ano}`,
      planejado: ehPercentual ? dados.pctPlan : dados.valorPlan,
      realizado: ehPercentual ? dados.pctReal : dados.valorReal,
      anterior: ehPercentual ? dados.pctAnterior : dados.valorAnterior,
    };
    return { ...linha, ...calcularVariacao(linha.realizado, linha.anterior) };
  });

  let total;
  if (ehPercentual) {
    // Percentual não se soma: o total do ano é ponderado pela receita.
    const somar = (campo) => dadosMensais.reduce((valor, item) => valor + item[campo], 0);
    const receitaPlan = somar("receitaPlan");
    const receitaReal = somar("receitaReal");
    const receitaAnterior = somar("receitaAnterior");
    total = {
      id: "total",
      label: "Total ponderado",
      planejado: receitaPlan ? (somar("valorPlan") / receitaPlan) * 100 : 0,
      realizado: receitaReal ? (somar("valorReal") / receitaReal) * 100 : 0,
      anterior: receitaAnterior ? (somar("valorAnterior") / receitaAnterior) * 100 : 0,
      nota: "Percentual do ano ponderado pela receita de cada mês.",
    };
  } else {
    const somar = (campo) => meses.reduce((valor, item) => valor + item[campo], 0);
    total = {
      id: "total",
      label: "Total",
      planejado: somar("planejado"),
      realizado: somar("realizado"),
      anterior: somar("anterior"),
    };
  }
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  // Na aba percentual a média simples convive com o total ponderado — os dois
  // respondem perguntas diferentes, então o rótulo diz qual é qual.
  const media = linhaMedia(meses, ano, ehPercentual ? "Média simples" : "Média");
  return [...meses, total, media];
}

export function totalCanalNoAno(plano, modulo, filialId, canalId, ano) {
  const filiais = itensSelecionados(plano.filiais, filialId);
  const canais = itensSelecionados(plano.canais, canalId);
  return MESES.reduce(
    (total, mes) => total + somarMes(plano, modulo, filiais, canais, ano, mes).planejado,
    0
  );
}

// Um canal criado na tela nasce zerado; sem esta exceção o filtro "ocultar
// canais sem valores" o esconderia logo após o cadastro.
export function canaisVisiveis(plano, modulo, filialId, ano, ocultarSemValores) {
  if (!ocultarSemValores) return plano.canais;
  return plano.canais.filter(
    (canal) => canal.manual || totalCanalNoAno(plano, modulo, filialId, canal.id, ano) !== 0
  );
}

const CAMPO_POR_TIPO = {
  filiais: "filiais",
  centros: "centros",
  canais: "canais",
  deducao: "deducoes",
};

export function campoDaDimensao(tipo) {
  return CAMPO_POR_TIPO[tipo] ?? null;
}

function limparChaves(registro, posicao, id, tamanho) {
  const resultado = {};
  Object.entries(registro).forEach(([chave, valor]) => {
    const partes = chave.split("|");
    if (partes.length === tamanho && partes[posicao] === id) return;
    resultado[chave] = valor;
  });
  return resultado;
}

// Sem esta limpeza as edições de uma dimensão excluída ficavam órfãs no plano e
// ressuscitavam se alguém recriasse a dimensão com o mesmo id.
export function removerDimensao(plano, tipo, id) {
  const campo = campoDaDimensao(tipo);
  if (!campo) return plano;

  const proximo = {
    ...plano,
    [campo]: plano[campo].filter((item) => item.id !== id),
  };

  if (tipo === "filiais") {
    proximo.planejado = limparChaves(plano.planejado, 1, id, 5);
    proximo.pctPlanejado = limparChaves(plano.pctPlanejado, 0, id, 5);
  } else if (tipo === "canais") {
    proximo.planejado = limparChaves(plano.planejado, 2, id, 5);
    proximo.pctPlanejado = limparChaves(plano.pctPlanejado, 1, id, 5);
  } else if (tipo === "deducao") {
    proximo.pctPlanejado = limparChaves(plano.pctPlanejado, 2, id, 5);
  }

  return proximo;
}
