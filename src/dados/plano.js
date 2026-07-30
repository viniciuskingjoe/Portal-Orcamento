import { MESES } from "./seeds.js";
import { modulo as definicaoDoModulo } from "./modulos.js";
import { contasDoModulo, moduloConfigurado } from "./visao.js";
import { somarRealizado } from "./realizado.js";
import { mesTemRealizado } from "./calendario.js";

// ============================================================================
// MODELO DO PLANO
//
// O plano guarda o período, a visão escolhida na criação e os valores planejados
// digitados pelo usuário — nada mais. Filiais, centros de custo, plano de contas
// e realizado vêm do ERP.
//
// `plano.planejado` tem chave `modulo|filial|ano|mes`. Célula sem valor digitado
// é ZERO, não um número gerado: não existe planejamento que ninguém fez.
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

function filiaisSelecionadas(filiais, filialId) {
  if (filialId === "total") return filiais;
  const item = filiais.find((entry) => entry.id === filialId);
  return item ? [item] : [];
}

// --------------------------------------------------------------------------
// Cálculo
// --------------------------------------------------------------------------

function planejadoDoMes(plano, moduloId, filiais, ano, mes) {
  return filiais.reduce(
    (total, filial) => total + (plano.planejado[chavePlanejado(moduloId, filial.id, ano, mes)] ?? 0),
    0
  );
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

// `realizado` e `realizadoAnterior` são os índices de dados/realizado.js para o
// ano selecionado e o anterior.
export function criarLinhasOrcamento({
  plano,
  visao,
  filiais,
  catalogo,
  realizado,
  realizadoAnterior,
  moduloId,
  filialId,
  ano,
}) {
  const modulo = definicaoDoModulo(moduloId);
  // Módulo sem classificação na visão não tem o que somar em nenhuma coluna.
  if (!modulo || !moduloConfigurado(visao, moduloId)) return linhasVazias(ano);

  const selecionadas = filiaisSelecionadas(filiais ?? [], filialId);
  const classificacoes = contasDoModulo(visao, moduloId);
  const somar = (indice, mes) =>
    indice
      ? somarRealizado({
          indice,
          catalogo,
          classificacoes,
          filiais: selecionadas,
          mes,
          tipo: modulo.tipo,
          grupo: modulo.grupo,
        })
      : 0;

  const meses = MESES.map((mes) => {
    const linha = {
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      planejado: planejadoDoMes(plano, moduloId, selecionadas, ano, mes),
      realizado: somar(realizado, mes),
      anterior: somar(realizadoAnterior, mes),
    };
    return { ...linha, ...calcularVariacao(linha.realizado, linha.anterior) };
  });

  const somarColuna = (campo) => meses.reduce((total, linha) => total + linha[campo], 0);
  const total = {
    id: "total",
    label: "Total",
    planejado: somarColuna("planejado"),
    realizado: somarColuna("realizado"),
    anterior: somarColuna("anterior"),
  };
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  return [...meses, total, linhaMedia(meses, ano)];
}

// Total planejado do módulo no ano — usado nos cartões e nos resumos.
export function totalPlanejadoNoAno({ plano, visao, filiais, moduloId, filialId, ano }) {
  if (!definicaoDoModulo(moduloId) || !moduloConfigurado(visao, moduloId)) return 0;
  const selecionadas = filiaisSelecionadas(filiais ?? [], filialId);
  return MESES.reduce(
    (total, mes) => total + planejadoDoMes(plano, moduloId, selecionadas, ano, mes),
    0
  );
}

// Filial vem do ERP e é global; se uma sair de lá, as edições ligadas a ela
// ficariam órfãs em todos os planos.
export function purgarFilialDosPlanos(planos, filialId) {
  return planos.map((plano) => {
    const restante = Object.fromEntries(
      Object.entries(plano.planejado).filter(([chave]) => chave.split("|")[1] !== filialId)
    );
    if (Object.keys(restante).length === Object.keys(plano.planejado).length) return plano;
    return { ...plano, planejado: restante };
  });
}
