import { CENTROS_SEED, FILIAIS_SEED, MESES } from "./seeds.js";
import { modulo as definicaoDoModulo } from "./modulos.js";
import { contasDoModulo, moduloConfigurado } from "./visao.js";
import { gerarPlanejado, gerarRealizado } from "./mock.js";
import { mesTemRealizado } from "./calendario.js";

// ============================================================================
// MODELO DO PLANO
//
// O plano guarda as dimensões de configuração (filiais, centros de custo), a
// visão escolhida na criação e as edições manuais do orçamento.
//
// `plano.planejado` guarda SOMENTE as edições manuais, com chave
// `modulo|filial|ano|mes`. Sem edição, o valor vem do gerador — o que mantém
// filiais novas coerentes (fator 0 -> zero nos dois lados) e o registro pequeno
// o bastante para caber no localStorage.
// ============================================================================

export function gerarId(prefixo) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function chavePlanejado(moduloId, filialId, ano, mes) {
  return `${moduloId}|${filialId}|${ano}|${mes}`;
}

export function criarPlano(id, nome, inicio, fim, visaoId) {
  return {
    id,
    nome,
    inicio,
    fim,
    visaoId,
    filiais: FILIAIS_SEED.map((item) => ({ ...item })),
    centros: CENTROS_SEED.map((item) => ({ ...item })),
    planejado: {},
  };
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

// --------------------------------------------------------------------------
// Leitura de valores
// --------------------------------------------------------------------------

function planejadoDaCelula(plano, modulo, filial, ano, mes) {
  const editado = plano.planejado[chavePlanejado(modulo.id, filial.id, ano, mes)];
  return editado ?? gerarPlanejado(modulo, filial, ano, mes);
}

function somarMes(plano, modulo, filiais, ano, mes) {
  let planejado = 0;
  let realizado = 0;
  let anterior = 0;
  filiais.forEach((filial) => {
    planejado += planejadoDaCelula(plano, modulo, filial, ano, mes);
    realizado += gerarRealizado(modulo, filial, ano, mes, false);
    anterior += gerarRealizado(modulo, filial, ano, mes, true);
  });
  return { planejado, realizado, anterior };
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
function linhaMedia(meses, ano) {
  const comRealizado = MESES.filter((mes) => mesTemRealizado(ano, mes)).length;
  const comAnterior = MESES.filter((mes) => mesTemRealizado(ano - 1, mes)).length;
  const somar = (campo) => meses.reduce((total, linha) => total + linha[campo], 0);

  const media = {
    id: "media",
    label: "Média",
    planejado: somar("planejado") / 12,
    realizado: comRealizado ? somar("realizado") / comRealizado : 0,
    anterior: comAnterior ? somar("anterior") / comAnterior : 0,
    nota: `Planejado ÷ 12 · Realizado ÷ ${comRealizado || 0} · Ano anterior ÷ ${comAnterior || 0} (meses com dado)`,
  };
  Object.assign(media, calcularVariacao(media.realizado, media.anterior));
  return media;
}

function linhasVazias(ano) {
  const meses = MESES.map((mes) => ({
    id: mes,
    label: `${String(mes).padStart(2, "0")}/${ano}`,
    planejado: 0,
    realizado: 0,
    anterior: 0,
    variacao: 0,
    variacaoPercentual: 0,
  }));
  const zero = { planejado: 0, realizado: 0, anterior: 0, variacao: 0, variacaoPercentual: 0 };
  return [
    ...meses,
    { id: "total", label: "Total", ...zero },
    { id: "media", label: "Média", ...zero },
  ];
}

// Um módulo sem conta selecionada na visão não tem o que somar: devolve zeros
// em vez de números inventados.
export function criarLinhasOrcamento(plano, visao, moduloId, filialId, ano) {
  const modulo = definicaoDoModulo(moduloId);
  if (!modulo || !moduloConfigurado(visao, moduloId)) return linhasVazias(ano);

  const filiais = itensSelecionados(plano.filiais, filialId);

  const meses = MESES.map((mes) => {
    const valores = somarMes(plano, modulo, filiais, ano, mes);
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

export function totalDoModuloNoAno(plano, visao, moduloId, filialId, ano) {
  const modulo = definicaoDoModulo(moduloId);
  if (!modulo || !moduloConfigurado(visao, moduloId)) return 0;
  const filiais = itensSelecionados(plano.filiais, filialId);
  return MESES.reduce(
    (total, mes) => total + somarMes(plano, modulo, filiais, ano, mes).planejado,
    0
  );
}

// Quantidade de contas que o módulo tem na visão do plano — usada nos cartões.
export function contasDoModuloNoPlano(visao, moduloId) {
  return contasDoModulo(visao, moduloId);
}

// --------------------------------------------------------------------------
// Dimensões de configuração
// --------------------------------------------------------------------------

const CAMPO_POR_TIPO = {
  filiais: "filiais",
  centros: "centros",
};

export function campoDaDimensao(tipo) {
  return CAMPO_POR_TIPO[tipo] ?? null;
}

// Sem esta limpeza as edições de uma filial excluída ficavam órfãs no plano e
// ressuscitavam se alguém recriasse a filial com o mesmo id.
export function removerDimensao(plano, tipo, id) {
  const campo = campoDaDimensao(tipo);
  if (!campo) return plano;

  const proximo = {
    ...plano,
    [campo]: plano[campo].filter((item) => item.id !== id),
  };

  if (tipo === "filiais") {
    proximo.planejado = Object.fromEntries(
      Object.entries(plano.planejado).filter(([chave]) => chave.split("|")[1] !== id)
    );
  }

  return proximo;
}
