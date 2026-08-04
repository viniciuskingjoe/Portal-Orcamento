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
  sinaisDoModulo,
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

// O que fica GRAVADO a partir do que a pessoa digitou.
//
// Só o módulo percentual tem duas colunas digitáveis, e só nele digitar em reais
// significa "converta para percentual". Num módulo em reais a única coluna
// também se chama `reais`, e essa coincidência de nome já custou caro: a
// conversão rodava lá também, a base valia 0, e todo valor digitado virava
// zero — que o servidor então apagava. Quem decide converter é o MÓDULO, não o
// nome da coluna.
export function valorParaGravar({ digitado, emReais, percentual, base }) {
  if (!percentual || !emReais) return digitado;
  return base ? (digitado / base) * 100 : 0;
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

// Em quais centros procurar o valor. Um centro escolhido é ele mesmo; SEM_CENTRO
// é o consolidado — "Total, todos os centros" — e aí é preciso somar os centros
// que a filial usa.
//
// Isto existe porque todo módulo passou a ser orçado por centro: nada mais fica
// gravado sob a chave de centro vazio. Ler o consolidado por aquela chave
// devolvia zero com valor lançado logo ao lado, e a tela mostrava Realizado
// cheio contra Planejado zerado — parecia erro de cálculo e era leitura no lugar
// errado.
function centrosParaLeitura(visao, moduloId, filialId, centroId) {
  if (centroId !== SEM_CENTRO) return [centroId];
  const daFilial = centrosDaFilial(visao, moduloId, filialId);
  // Sem visão (ou filial sem centro) sobra a própria chave vazia: é o que os
  // planos anteriores ao centro obrigatório têm gravado.
  return daFilial.length ? daFilial : [SEM_CENTRO];
}

function digitadoDoMes(plano, visao, moduloId, filialId, centroId, contas, mes) {
  let total = 0;
  for (const centro of centrosParaLeitura(visao, moduloId, filialId, centroId)) {
    for (const conta of contas) {
      total += plano.planejado[chavePlanejado(moduloId, filialId, centro, conta, mes)] ?? 0;
    }
  }
  return total;
}

// Contas de receita que servem de base numa filial — a lista que a tela do
// módulo percentual mostra à esquerda, ao lado das contas do próprio módulo.
export function receitasDaBase(visao, filialId) {
  return contasDaFilial(visao, MODULO_BASE_DO_PERCENTUAL, filialId);
}

// As contas de receita em tela: as escolhidas, ou a união das das filiais.
function receitasEmTela(visao, filiais, receitas) {
  if (Array.isArray(receitas)) return receitas;
  const todas = new Set();
  (filiais ?? []).forEach((filial) =>
    receitasDaBase(visao, filial.id).forEach((codigo) => todas.add(codigo))
  );
  return [...todas];
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
      const daFilial = digitadoDoMes(plano, visao, moduloId, filial.id, centroId, contas, mes);
      digitado += daFilial;
      reais += daFilial;
      return;
    }

    const centros = centrosParaLeitura(visao, moduloId, filial.id, centroId);

    (receitas ?? receitasDaBase(visao, filial.id)).forEach((receita) => {
      const baseDaConta = baseDaReceita(plano, visao, filial.id, receita, mes);
      base += baseDaConta;

      // A taxa é somada sobre os centros da mesma forma que o valor em reais:
      // no consolidado, duas taxas lançadas em centros diferentes compõem a taxa
      // da filial, e ler só a chave de centro vazio devolveria zero.
      centros.forEach((centro) => {
        contas.forEach((conta) => {
          const chave = chavePlanejado(moduloId, filial.id, centro, conta, mes, receita);
          const lancado = plano.planejado[chave] ?? 0;
          digitado += lancado;
          reais += (lancado / 100) * baseDaConta;
        });
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

// Quanto o realizado ficou acima ou abaixo do que se orçou.
//
// É outra pergunta que a `Variação %`, que compara com o ano anterior — e é a
// diferença que fazia a linha Total divergir do Scoreplan: lá o Total troca de
// referência e passa a comparar com o planejado, mantendo o `Variação $` contra
// o ano anterior. Em vez de herdar duas perguntas sob o mesmo rótulo, cada uma
// ganhou coluna própria.
//
// `null` quando não há orçamento no período: sem planejado não existe
// atingimento, e mostrar −100% sugeriria que se orçou algo e não se realizou.
function vsOrcado(realizado, planejado) {
  return planejado ? ((realizado - planejado) / Math.abs(planejado)) * 100 : null;
}

// Todas as colunas dividem por 12 — o mesmo divisor, sempre.
//
// Antes o realizado dividia pelos meses com dado e o planejado por 12, para a
// média do realizado não ficar diluída pelos meses que ainda nem chegaram. A
// intenção era boa e o resultado, errado: a Variação da linha passava a comparar
// uma média de 8 meses com uma de 12, e esse número não significa nada — ainda
// por cima aparecia em verde, como ganho, quando o ano estava atrás.
//
// Uma média só é comparável coluna a coluna se as colunas dividirem pelo mesmo
// número, e é o que o Scoreplan faz. O custo é conhecido e está na nota da tela:
// no meio do ano isto é "um doze avos do ano", não "o ritmo mensal".
function linhaMedia(meses) {
  const somar = (campo) => meses.reduce((total, linha) => total + linha[campo], 0);

  const media = {
    id: "media",
    label: "Média",
    planejado: somar("planejado") / 12,
    // A taxa média do ano é a do Total (valor ÷ base), não a média das taxas
    // mensais. Repetir o mesmo número em duas linhas confundiria mais do que
    // ajudaria, então a média não mostra percentual.
    planejadoPercentual: null,
    realizadoPercentual: null,
    base: somar("base") / 12,
    baseRealizada: somar("baseRealizada") / 12,
    realizado: somar("realizado") / 12,
    anterior: somar("anterior") / 12,
    nota: "Total ÷ 12 em todas as colunas. Os meses que ainda não chegaram entram como zero, então no meio do ano a média do realizado fica abaixo do ritmo mensal.",
  };
  media.vsOrcado = vsOrcado(media.realizado, media.planejado);
  Object.assign(media, calcularVariacao(media.realizado, media.anterior));
  return media;
}

function linhasVazias(ano) {
  const zero = {
    planejado: 0,
    planejadoPercentual: null,
    base: 0,
    realizado: 0,
    realizadoPercentual: null,
    baseRealizada: 0,
    anterior: 0,
    variacao: 0,
    variacaoPercentual: 0,
    // Sem orçamento não há atingimento — a coluna mostra "—", não 0%.
    vsOrcado: null,
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

  const percentual = ehPercentual(moduloId);

  // Base do realizado: a receita que de fato aconteceu, não a planejada. É o que
  // torna "Realizado %" comparável com "Planejado %" — os dois passam a ser a
  // fatia da receita do próprio período. Conta de receita o ERP identifica
  // direto, sem precisar do mapa de centro de custo.
  const contasDeReceita = percentual ? receitasEmTela(visao, filiais, receitas) : null;
  const receitaRealizada = (indice, mes) =>
    contasDeReceita?.length
      ? somarRealizado({
          indice,
          catalogo,
          contas: contasDeReceita,
          filiais,
          centroId: SEM_CENTRO,
          mes,
          tipoPadrao: "receita",
          visaoContabil,
        })
      : 0;

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
    // Mês que ainda não aconteceu não tem realizado, mesmo que o razão já tenha
    // lançamento com data futura — e tem: juros de financiamento, pró-labore,
    // aluguel e depreciação são lançados com meses de antecedência. Somá-los
    // aqui punha em "Realizado" um valor de mês que nem começou, e ainda brigava
    // com a média, que já divide só pelos meses com dado.
    const houve = mesTemRealizado(ano, mes);
    const linha = {
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      planejado: planejado.reais,
      // O que o usuário digita. `null` fora dos módulos percentuais, para a
      // tabela saber que não há coluna a mostrar.
      planejadoPercentual: percentual ? planejado.digitado : null,
      base: planejado.base,
      realizado: houve ? somarRealizado({ ...comum, indice: realizado, mes }) : 0,
      baseRealizada: houve ? receitaRealizada(realizado, mes) : 0,
      anterior: mesTemRealizado(ano - 1, mes)
        ? somarRealizado({ ...comum, indice: realizadoAnterior, mes })
        : 0,
    };
    return {
      ...linha,
      realizadoPercentual: percentual ? taxa(linha.realizado, linha.baseRealizada) : null,
      vsOrcado: vsOrcado(linha.realizado, linha.planejado),
      ...calcularVariacao(linha.realizado, linha.anterior),
    };
  });

  const somarColuna = (campo) => meses.reduce((total, linha) => total + linha[campo], 0);
  const total = {
    id: "total",
    label: "Total",
    planejado: somarColuna("planejado"),
    base: somarColuna("base"),
    realizado: somarColuna("realizado"),
    baseRealizada: somarColuna("baseRealizada"),
    anterior: somarColuna("anterior"),
  };
  total.planejadoPercentual = percentual ? taxa(total.planejado, total.base) : null;
  total.realizadoPercentual = percentual ? taxa(total.realizado, total.baseRealizada) : null;
  total.vsOrcado = vsOrcado(total.realizado, total.planejado);
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  return [...meses, total, linhaMedia(meses)];
}

// Totais do ano de um módulo inteiro, em REAIS — a linha que a visão
// consolidada precisa. Módulo percentual entra convertido; somar percentuais
// numa linha de DRE não significaria nada.
//
// Percorre filial a filial porque as contas são por filial: aplicar a união
// delas em todas somaria realizado de conta que a visão não deu àquela filial.
// Nos módulos com centro de custo o planejado ainda desce por centro, que é onde
// o valor está gravado; o realizado não precisa, porque somar todos os centros
// de uma filial é o mesmo que não filtrar.
export function totaisDoModuloNoAno({
  plano,
  visao,
  moduloId,
  filiais,
  catalogo = CATALOGO_VAZIO,
  realizado,
  realizadoAnterior,
}) {
  const modulo = definicaoDoModulo(moduloId);
  const totais = { planejado: 0, realizado: 0, anterior: 0 };
  if (!modulo || !moduloConfigurado(visao, moduloId)) return totais;

  const ano = plano?.ano;
  const usaCentro = usaCentroDeCusto(visao, moduloId);
  const sinais = sinaisDoModulo(visao, moduloId);

  (filiais ?? []).forEach((filial) => {
    const daFilial = contasEfetivasDoModulo(visao, moduloId, filial.id);
    if (!daFilial.length) return;

    const centros = usaCentro ? centrosDaFilial(visao, moduloId, filial.id) : [SEM_CENTRO];
    const comum = {
      contas: daFilial,
      filiais: [filial],
      centroId: SEM_CENTRO,
      catalogo,
      tipoPadrao: modulo.tipo,
      sinais,
      visaoContabil: visao?.visaoContabil,
    };

    MESES.forEach((mes) => {
      centros.forEach((centroId) => {
        const contas = contasEfetivasDoModulo(visao, moduloId, filial.id, centroId);
        totais.planejado += planejadoDoMes(
          plano,
          visao,
          moduloId,
          [filial],
          centroId,
          contas,
          mes
        ).reais;
      });

      if (mesTemRealizado(ano, mes)) {
        totais.realizado += somarRealizado({ ...comum, indice: realizado, mes });
      }
      if (mesTemRealizado(ano - 1, mes)) {
        totais.anterior += somarRealizado({ ...comum, indice: realizadoAnterior, mes });
      }
    });
  });

  return totais;
}

// Só o planejado — usado onde não há realizado carregado.
export function totalPlanejadoNoAno(argumentos) {
  return totaisDoModuloNoAno(argumentos).planejado;
}

// --------------------------------------------------------------------------
// O plano em REAIS, pronto para o orçamento do Linx
//
// A tabela do ERP (CTB_CONTA_ORCAMENTO) guarda uma linha por
// filial × centro × classificação × mês, com o valor em reais. O portal guarda
// outra coisa: nos módulos percentuais o que está gravado é a TAXA, e a chave
// tem um sexto segmento — a conta de receita sobre a qual ela incide — que não
// existe do lado de lá.
//
// Então a conversão faz duas coisas:
//
//   1. Percentual vira reais, mês a mês, sobre a receita planejada daquela
//      conta base. É a mesma regra da tela; publicar o percentual cru mandaria
//      "1,7" para o Power BI no lugar de um valor.
//   2. A dimensão receita colapsa somando. Duas deduções lançadas contra
//      receitas diferentes viram uma linha só no ERP, que é o que ele comporta.
//
// Chave sem correspondente na visão é ignorada: conta que saiu da visão continua
// gravada no plano (é o histórico do que se digitou), mas publicar um valor que
// a tela não mostra mais faria o Power BI divergir do portal.
// --------------------------------------------------------------------------

export function linhasParaOrcamento({ plano, visao }) {
  if (!plano || !visao) return [];

  const somado = new Map();

  for (const [chave, valor] of Object.entries(plano.planejado ?? {})) {
    if (!valor) continue;

    const [moduloId, filialId, centroId, conta, mesTexto, receita] = chave.split("|");
    const mes = Number(mesTexto);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) continue;

    // A conta precisa continuar valendo para esta combinação na visão.
    if (!contasEfetivasDoModulo(visao, moduloId, filialId, centroId).includes(conta)) continue;

    let reais = valor;
    if (ehPercentual(moduloId)) {
      // Sem a receita na chave não há base: é lançamento de antes da regra que
      // passou a exigir a receita, e converter sobre a receita inteira daria um
      // valor diferente do que a tela mostra.
      if (!receita) continue;
      reais = (valor / 100) * baseDaReceita(plano, visao, filialId, receita, mes);
    }

    if (!reais) continue;

    const destino = `${filialId}|${centroId}|${conta}|${mes}`;
    somado.set(destino, (somado.get(destino) ?? 0) + reais);
  }

  return [...somado.entries()]
    .map(([destino, valor]) => {
      const [filial, centro, conta, mes] = destino.split("|");
      // Duas casas: é o que a coluna VALOR do ERP comporta, numeric(14,2).
      return { filial, centro, conta, mes: Number(mes), valor: Math.round(valor * 100) / 100 };
    })
    .filter((linha) => linha.valor !== 0)
    .sort(
      (a, b) =>
        a.filial.localeCompare(b.filial) ||
        a.centro.localeCompare(b.centro) ||
        a.conta.localeCompare(b.conta) ||
        a.mes - b.mes
    );
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
