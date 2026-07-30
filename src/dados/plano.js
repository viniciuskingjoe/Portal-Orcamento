import { MESES } from "./seeds.js";
import { modulo as definicaoDoModulo } from "./modulos.js";
import { SEM_CENTRO, contasEfetivasDoModulo, moduloConfigurado } from "./visao.js";
import { somarRealizado } from "./realizado.js";
import { mesTemRealizado } from "./calendario.js";
import { CATALOGO_VAZIO } from "./contas.js";

// ============================================================================
// MODELO DO PLANO
//
// O plano tem UM ano, a visão escolhida na criação e os valores planejados.
//
// `plano.planejado` tem chave `modulo|filial|centro|conta|mes`. O ano não entra
// porque o plano já é de um ano só. `centro` é string vazia nos módulos que não
// usam centro de custo.
//
// Célula sem valor digitado é ZERO — não existe planejamento que ninguém fez.
// ============================================================================

export function gerarId(prefixo) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function chavePlanejado(moduloId, filialId, centroId, conta, mes) {
  return `${moduloId}|${filialId}|${centroId ?? SEM_CENTRO}|${conta}|${mes}`;
}

export function criarPlano(id, nome, ano, visaoId) {
  return { id, nome, ano, visaoId, planejado: {} };
}

// --------------------------------------------------------------------------
// Cálculo
// --------------------------------------------------------------------------

function planejadoDoMes(plano, moduloId, filiais, centroId, contas, mes) {
  let total = 0;
  filiais.forEach((filial) => {
    contas.forEach((conta) => {
      total += plano.planejado[chavePlanejado(moduloId, filial.id, centroId, conta, mes)] ?? 0;
    });
  });
  return total;
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

// `contas` são os códigos a somar: uma conta específica quando o usuário
// seleciona uma na lateral, ou todas as do módulo para a visão consolidada.
export function criarLinhasOrcamento({
  plano,
  moduloId,
  filiais,
  centroId = SEM_CENTRO,
  contas,
  catalogo = CATALOGO_VAZIO,
  sinais,
  visaoContabil,
  realizado,
  realizadoAnterior,
}) {
  const modulo = definicaoDoModulo(moduloId);
  const ano = plano?.ano;
  if (!modulo || !contas?.length || !filiais?.length) return linhasVazias(ano);

  // O sinal é decidido conta a conta pelo grupo contábil dela, não pelo tipo do
  // módulo: "Outras despesas" contém contas de receita.
  const comum = {
    contas,
    filiais,
    centroId,
    catalogo,
    tipoPadrao: modulo.tipo,
    sinais,
    visaoContabil,
  };

  // Mês que ainda não aconteceu não tem realizado, mesmo que o razão já tenha
  // lançamento com data futura — e tem: juros de financiamento, pró-labore,
  // aluguel e depreciação são lançados com meses de antecedência. Somá-los aqui
  // punha em "Realizado" um valor de mês que nem começou, e ainda brigava com a
  // média, que já divide só pelos meses com dado.
  const meses = MESES.map((mes) => {
    const linha = {
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      planejado: planejadoDoMes(plano, moduloId, filiais, centroId, contas, mes),
      realizado: mesTemRealizado(ano, mes)
        ? somarRealizado({ ...comum, indice: realizado, mes })
        : 0,
      anterior: mesTemRealizado(ano - 1, mes)
        ? somarRealizado({ ...comum, indice: realizadoAnterior, mes })
        : 0,
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

// Total planejado do módulo no ano — usado nos cartões da visão geral.
export function totalPlanejadoNoAno({ plano, visao, moduloId, filiais }) {
  if (!definicaoDoModulo(moduloId) || !moduloConfigurado(visao, moduloId)) return 0;

  let total = 0;
  (filiais ?? []).forEach((filial) => {
    const contas = contasEfetivasDoModulo(visao, moduloId, filial.id);
    MESES.forEach((mes) => {
      total += planejadoDoMes(plano, moduloId, [filial], SEM_CENTRO, contas, mes);
    });
  });
  return total;
}

// Filial vem do ERP; se sair de lá, as edições ligadas a ela ficariam órfãs em
// todos os planos.
export function purgarFilialDosPlanos(planos, filialId) {
  return planos.map((plano) => {
    const restante = Object.fromEntries(
      Object.entries(plano.planejado).filter(([chave]) => chave.split("|")[1] !== filialId)
    );
    if (Object.keys(restante).length === Object.keys(plano.planejado).length) return plano;
    return { ...plano, planejado: restante };
  });
}
