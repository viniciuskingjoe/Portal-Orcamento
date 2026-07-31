import { MESES } from "./seeds.js";
import {
  MODULO_BASE_DO_PERCENTUAL,
  modulo as definicaoDoModulo,
  ehPercentual,
} from "./modulos.js";
import {
  SEM_CENTRO,
  centrosDaFilial,
  contasDaFilial,
  contasEfetivasDoModulo,
  moduloConfigurado,
  usaCentroDeCusto,
} from "./visao.js";
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
// O que está gravado é SEMPRE o que foi digitado: reais na maioria dos módulos,
// percentual nos que têm `percentual: true`. Guardar o digitado, e não o valor
// já convertido, é o que faz o plano acompanhar a receita: mudou a previsão de
// faturamento, a dedução recalcula sozinha.
//
// Nos módulos percentuais a chave ganha um SEXTO segmento, a conta de receita
// que serve de base:
//
//   deducoes-vendas|000001||3.1.2.01.001|1|3.1.1.01.001
//                                            └ ICMS s/ devolução  └ vendas de
//                                                                   produtos
//                                                                   coleção
//
// É o mesmo recorte do Scoreplan, que pede produto/serviço E dedução antes de
// aceitar o percentual: 2% de devolução sobre coleção não é 2% sobre e-commerce,
// e um percentual único sobre a receita inteira não saberia diferenciar.
//
// Célula sem valor digitado é ZERO — não existe planejamento que ninguém fez.
// ============================================================================

export function gerarId(prefixo) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// `receita` só existe nos módulos percentuais. Vai no fim para não mexer na
// posição da filial, que `purgarFilialDosPlanos` lê por índice.
export function chavePlanejado(moduloId, filialId, centroId, conta, mes, receita = null) {
  const chave = `${moduloId}|${filialId}|${centroId ?? SEM_CENTRO}|${conta}|${mes}`;
  return receita ? `${chave}|${receita}` : chave;
}

export function criarPlano(id, nome, ano, visaoId) {
  return { id, nome, ano, visaoId, planejado: {} };
}

// --------------------------------------------------------------------------
// Cálculo
// --------------------------------------------------------------------------

function digitadoDoMes(plano, moduloId, filialId, centroId, contas, mes) {
  let total = 0;
  contas.forEach((conta) => {
    total += plano.planejado[chavePlanejado(moduloId, filialId, centroId, conta, mes)] ?? 0;
  });
  return total;
}

// Contas de receita que servem de base numa filial — a lista que a tela do
// módulo percentual mostra à esquerda, ao lado das contas do próprio módulo.
export function receitasDaBase(visao, filialId) {
  return contasDaFilial(visao, MODULO_BASE_DO_PERCENTUAL, filialId);
}

// Receita planejada de UMA conta de receita, na filial e no mês.
//
// Soma todos os centros quando o módulo de receita usa centro de custo: a base
// é a receita da filial, independente de como ela foi distribuída entre centros.
function baseDaReceita(plano, visao, filialId, receita, mes) {
  const base = MODULO_BASE_DO_PERCENTUAL;
  const centros = usaCentroDeCusto(visao, base)
    ? centrosDaFilial(visao, base, filialId)
    : [SEM_CENTRO];

  let total = 0;
  centros.forEach((centroId) => {
    total += plano.planejado[chavePlanejado(base, filialId, centroId, receita, mes)] ?? 0;
  });
  return total;
}

// Base do percentual na filial: soma das receitas consideradas. `receitas` vem
// da tela — todas, ou só a que o usuário selecionou.
export function baseDoPercentual(plano, visao, filialId, mes, receitas = null) {
  if (!plano || !visao) return 0;
  return (receitas ?? receitasDaBase(visao, filialId)).reduce(
    (total, receita) => total + baseDaReceita(plano, visao, filialId, receita, mes),
    0
  );
}

// Planejado do mês nas duas leituras: o digitado (reais ou percentual) e o valor
// em reais.
//
// Em módulo percentual a conversão é por filial E por conta de receita: o
// percentual lançado contra "vendas de produtos - coleção" incide sobre a
// receita daquela conta, não sobre a receita total. Aplicar uma base única
// aqui daria o número errado justamente na tela "Total", que é onde ninguém
// confere linha a linha.
function planejadoDoMes(plano, visao, moduloId, filiais, centroId, contas, mes, receitas) {
  const percentual = ehPercentual(moduloId);
  let digitado = 0;
  let reais = 0;
  let base = 0;

  filiais.forEach((filial) => {
    if (!percentual) {
      const daFilial = digitadoDoMes(plano, moduloId, filial.id, centroId, contas, mes);
      digitado += daFilial;
      reais += daFilial;
      return;
    }

    (receitas ?? receitasDaBase(visao, filial.id)).forEach((receita) => {
      const baseDaConta = baseDaReceita(plano, visao, filial.id, receita, mes);
      base += baseDaConta;

      contas.forEach((conta) => {
        const chave = chavePlanejado(moduloId, filial.id, centroId, conta, mes, receita);
        const lancado = plano.planejado[chave] ?? 0;
        digitado += lancado;
        reais += (lancado / 100) * baseDaConta;
      });
    });
  });

  return { digitado, reais, base };
}

// Percentual que um valor representa sobre a base. Nas linhas de resumo é isto,
// e não a soma dos percentuais dos meses: somar taxas mensais dá um número que
// não é taxa de nada.
function taxa(reais, base) {
  return base ? (reais / base) * 100 : 0;
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
    // A taxa média do ano é a do Total (valor ÷ base), não a média das taxas
    // mensais. Repetir o mesmo número em duas linhas confundiria mais do que
    // ajudaria, então a média não mostra percentual.
    planejadoPercentual: null,
    base: somar("base") / 12,
    realizado: comRealizado ? somar("realizado") / comRealizado : 0,
    anterior: comAnterior ? somar("anterior") / comAnterior : 0,
    nota: `Planejado ÷ 12 · Realizado ÷ ${comRealizado || 0} · Ano anterior ÷ ${comAnterior || 0} (meses com dado)`,
  };
  Object.assign(media, calcularVariacao(media.realizado, media.anterior));
  return media;
}

function linhasVazias(ano) {
  const zero = {
    planejado: 0,
    planejadoPercentual: null,
    base: 0,
    realizado: 0,
    anterior: 0,
    variacao: 0,
    variacaoPercentual: 0,
  };
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
  visao,
  moduloId,
  filiais,
  centroId = SEM_CENTRO,
  contas,
  // Contas de receita que entram na base. `undefined` = todas as da filial.
  receitas,
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
  // `receitas` recorta o realizado do mesmo jeito que recorta o planejado: se a
  // tela está numa receita, a coluna comparativa tem que ser da mesma receita,
  // senão o planejado é de uma fatia e o realizado do bolo inteiro.
  const comum = {
    contas,
    filiais,
    centroId,
    catalogo,
    tipoPadrao: modulo.tipo,
    sinais,
    visaoContabil,
    receitas: ehPercentual(moduloId) ? receitas : undefined,
  };

  // Mês que ainda não aconteceu não tem realizado, mesmo que o razão já tenha
  // lançamento com data futura — e tem: juros de financiamento, pró-labore,
  // aluguel e depreciação são lançados com meses de antecedência. Somá-los aqui
  // punha em "Realizado" um valor de mês que nem começou, e ainda brigava com a
  // média, que já divide só pelos meses com dado.
  const percentual = ehPercentual(moduloId);

  const meses = MESES.map((mes) => {
    const planejado = planejadoDoMes(
      plano,
      visao,
      moduloId,
      filiais,
      centroId,
      contas,
      mes,
      receitas
    );
    const linha = {
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      planejado: planejado.reais,
      // O que o usuário digita. `null` fora dos módulos percentuais, para a
      // tabela saber que não há coluna a mostrar.
      planejadoPercentual: percentual ? planejado.digitado : null,
      base: planejado.base,
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
    base: somarColuna("base"),
    realizado: somarColuna("realizado"),
    anterior: somarColuna("anterior"),
  };
  total.planejadoPercentual = percentual ? taxa(total.planejado, total.base) : null;
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  return [...meses, total, linhaMedia(meses, ano)];
}

// Total planejado do módulo no ano, em REAIS — usado nos cartões da visão geral.
// Módulo percentual entra convertido; somar percentuais num cartão de valor não
// significaria nada.
export function totalPlanejadoNoAno({ plano, visao, moduloId, filiais }) {
  if (!definicaoDoModulo(moduloId) || !moduloConfigurado(visao, moduloId)) return 0;

  let total = 0;
  (filiais ?? []).forEach((filial) => {
    const contas = contasEfetivasDoModulo(visao, moduloId, filial.id);
    MESES.forEach((mes) => {
      total += planejadoDoMes(plano, visao, moduloId, [filial], SEM_CENTRO, contas, mes).reais;
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
