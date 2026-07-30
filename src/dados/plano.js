import { MESES } from "./seeds.js";
import { modulo as definicaoDoModulo } from "./modulos.js";
import { moduloConfigurado } from "./visao.js";
import { gerarPlanejado, gerarRealizado } from "./mock.js";
import { mesTemRealizado } from "./calendario.js";

// ============================================================================
// MODELO DO PLANO
//
// O plano guarda o período, a visão escolhida na criação e as edições manuais
// do orçamento. Filiais e centros de custo NÃO ficam aqui: são configuração
// global do portal (ver dados/configuracao.js).
//
// `plano.planejado` guarda SOMENTE as edições manuais, com chave
// `modulo|filial|ano|mes`. Sem edição, o valor vem do gerador — o que mantém
// filial nova coerente (fator 0 -> zero nos dois lados) e o registro pequeno
// o bastante para caber no localStorage.
// ============================================================================

export function gerarId(prefixo) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function chavePlanejado(moduloId, filialId, ano, mes) {
  return `${moduloId}|${filialId}|${ano}|${mes}`;
}

export function criarPlano(id, nome, inicio, fim, visaoId) {
  return { id, nome, inicio, fim, visaoId, planejado: {} };
}

export function anosDoPlano(plano) {
  return Array.from({ length: plano.fim - plano.inicio + 1 }, (_, i) => plano.inicio + i);
}

// "total" seleciona a lista inteira; caso contrário, o item correspondente.
function filiaisSelecionadas(filiais, filialId) {
  if (filialId === "total") return filiais;
  const item = filiais.find((entry) => entry.id === filialId);
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
  const zero = { planejado: 0, realizado: 0, anterior: 0, variacao: 0, variacaoPercentual: 0 };
  return [
    ...MESES.map((mes) => ({
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      ...zero,
    })),
    { id: "total", label: "Total", ...zero },
    { id: "media", label: "Média", ...zero },
  ];
}

// Um módulo sem conta selecionada na visão não tem o que somar: devolve zeros
// em vez de números inventados.
export function criarLinhasOrcamento({ plano, visao, filiais, moduloId, filialId, ano }) {
  const modulo = definicaoDoModulo(moduloId);
  if (!modulo || !moduloConfigurado(visao, moduloId)) return linhasVazias(ano);

  const selecionadas = filiaisSelecionadas(filiais ?? [], filialId);

  const meses = MESES.map((mes) => {
    const valores = somarMes(plano, modulo, selecionadas, ano, mes);
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

export function totalDoModuloNoAno({ plano, visao, filiais, moduloId, filialId, ano }) {
  const modulo = definicaoDoModulo(moduloId);
  if (!modulo || !moduloConfigurado(visao, moduloId)) return 0;
  const selecionadas = filiaisSelecionadas(filiais ?? [], filialId);
  return MESES.reduce(
    (total, mes) => total + somarMes(plano, modulo, selecionadas, ano, mes).planejado,
    0
  );
}

// Filial é global, então excluir uma tem que limpar as edições dela em TODOS os
// planos — senão as chaves ficam órfãs e ressuscitam se a filial for recriada
// com o mesmo id.
export function purgarFilialDosPlanos(planos, filialId) {
  return planos.map((plano) => {
    const restante = Object.fromEntries(
      Object.entries(plano.planejado).filter(([chave]) => chave.split("|")[1] !== filialId)
    );
    if (Object.keys(restante).length === Object.keys(plano.planejado).length) return plano;
    return { ...plano, planejado: restante };
  });
}
