import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  chavePlanejado,
  criarLinhasOrcamento,
  valorParaGravar,
  criarPlano,
  purgarFilialDosPlanos,
  receitasDaBase,
  totalPlanejadoNoAno,
} from "../src/dados/plano.js";
import { indexarRealizado } from "../src/dados/realizado.js";
import {
  SEM_CENTRO,
  criarVisao,
  definirContasDaFilial,
  definirContasDoCentro,
  definirUsaCentroDeCusto,
} from "../src/dados/visao.js";
import { indexarContas } from "../src/dados/contas.js";

const ANO = 2025;
const MODULO = "receita-vendas";
const DESPESA = "despesas-operacionais";
const CONTA = "3.1.1.01.001";
const OUTRA_CONTA = "3.1.1.01.002";

const FILIAIS = [
  { id: "000001", nome: "KING&JOE" },
  { id: "000025", nome: "MEN HUB" },
];

const realizado = indexarRealizado([
  { classificacao: CONTA, filial: "000001", centro: "002", mes: 1, debito: 0, credito: 1000 },
  { classificacao: CONTA, filial: "000025", centro: "002", mes: 1, debito: 0, credito: 500 },
  { classificacao: CONTA, filial: "000001", centro: "002", mes: 2, debito: 0, credito: 2000 },
]);

const anterior = indexarRealizado([
  { classificacao: CONTA, filial: "000001", centro: "002", mes: 1, debito: 0, credito: 800 },
]);

const plano = (planejado = {}) => ({ ...criarPlano("p1", "Oficial", ANO, "v1"), planejado });

const linhas = (extra) =>
  criarLinhasOrcamento({
    plano: plano(),
    moduloId: MODULO,
    filiais: FILIAIS,
    centroId: SEM_CENTRO,
    contas: [CONTA],
    realizado,
    realizadoAnterior: anterior,
    ...extra,
  });

const mes = (lista, numero) => lista.find((linha) => linha.id === numero);
const totalDe = (lista) => lista.find((linha) => linha.id === "total");
const mediaDe = (lista) => lista.find((linha) => linha.id === "media");

// ---------------------------------------------------------------------------
// Plano de um ano só
// ---------------------------------------------------------------------------

test("plano tem um ano, e o rótulo dos meses usa ele", () => {
  const p = criarPlano("p1", "Oficial", 2026, "v1");
  assert.equal(p.ano, 2026);
  assert.equal(p.inicio, undefined);

  const lista = criarLinhasOrcamento({
    plano: p,
    moduloId: MODULO,
    filiais: FILIAIS,
    contas: [CONTA],
    realizado,
    realizadoAnterior: anterior,
  });
  assert.equal(mes(lista, 1).label, "01/2026");
  assert.equal(mes(lista, 12).label, "12/2026");
});

// O razão tem lançamento com data futura (juros, pró-labore, aluguel,
// depreciação são lançados com meses de antecedência). Mês que não aconteceu
// não pode aparecer como realizado — nem no mês, nem no total.
test("mês que ainda não aconteceu fica com realizado zero", () => {
  const hoje = new Date();
  const anoCorrente = hoje.getFullYear();
  const mesCorrente = hoje.getMonth() + 1;
  if (mesCorrente === 12) return; // dezembro não tem mês futuro no ano

  const futuro = mesCorrente + 1;
  const comFuturo = indexarRealizado([
    { classificacao: CONTA, filial: "000001", centro: "002", mes: mesCorrente, debito: 0, credito: 100 },
    { classificacao: CONTA, filial: "000001", centro: "002", mes: futuro, debito: 0, credito: 900 },
  ]);

  const lista = criarLinhasOrcamento({
    plano: { ...criarPlano("p1", "Oficial", anoCorrente, "v1"), planejado: {} },
    moduloId: MODULO,
    filiais: FILIAIS,
    contas: [CONTA],
    realizado: comFuturo,
    realizadoAnterior: indexarRealizado([]),
  });

  assert.equal(mes(lista, mesCorrente).realizado, 100);
  assert.equal(mes(lista, futuro).realizado, 0);
  assert.equal(totalDe(lista).realizado, 100);
});

// ---------------------------------------------------------------------------
// Planejado por módulo, filial, centro e conta
// ---------------------------------------------------------------------------

test("célula sem valor digitado é zero", () => {
  const lista = linhas();
  lista.forEach((linha) => assert.equal(linha.planejado, 0, `planejado de ${linha.label}`));
});

test("valor digitado aparece no mês e no total", () => {
  const digitado = { [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 3)]: 12345 };
  const lista = linhas({ plano: plano(digitado) });

  assert.equal(mes(lista, 3).planejado, 12345);
  assert.equal(mes(lista, 4).planejado, 0);
  assert.equal(totalDe(lista).planejado, 12345);
});

test("a chave separa módulo, filial, centro e conta", () => {
  const digitado = { [chavePlanejado(MODULO, "000001", "002", CONTA, 1)]: 999 };
  const p = plano(digitado);

  // Só a combinação exata devolve o valor.
  assert.equal(mes(linhas({ plano: p, centroId: "002", filiais: [FILIAIS[0]] }), 1).planejado, 999);
  assert.equal(mes(linhas({ plano: p, centroId: SEM_CENTRO, filiais: [FILIAIS[0]] }), 1).planejado, 0);
  assert.equal(mes(linhas({ plano: p, centroId: "002", filiais: [FILIAIS[1]] }), 1).planejado, 0);
  assert.equal(
    mes(linhas({ plano: p, centroId: "002", filiais: [FILIAIS[0]], contas: [OUTRA_CONTA] }), 1)
      .planejado,
    0
  );
  assert.equal(
    mes(linhas({ plano: p, centroId: "002", filiais: [FILIAIS[0]], moduloId: DESPESA }), 1)
      .planejado,
    0
  );
});

test("planejado de várias filiais e contas soma", () => {
  const digitado = {
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 100,
    [chavePlanejado(MODULO, "000025", SEM_CENTRO, CONTA, 1)]: 25,
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, OUTRA_CONTA, 1)]: 7,
  };
  const lista = linhas({ plano: plano(digitado), contas: [CONTA, OUTRA_CONTA] });
  assert.equal(mes(lista, 1).planejado, 132);
});

// ---------------------------------------------------------------------------
// Realizado
// ---------------------------------------------------------------------------

test("realizado e ano anterior vêm dos índices do ERP", () => {
  const lista = linhas();
  assert.equal(mes(lista, 1).realizado, 1500);
  assert.equal(mes(lista, 2).realizado, 2000);
  assert.equal(mes(lista, 1).anterior, 800);
  assert.equal(mes(lista, 1).variacao, 700);
  assert.equal(totalDe(lista).realizado, 3500);
});

test("realizado ausente não quebra a tabela", () => {
  const lista = linhas({ realizado: undefined, realizadoAnterior: undefined });
  assert.equal(totalDe(lista).realizado, 0);
  assert.equal(totalDe(lista).variacaoPercentual, 0);
});

test("sem conta ou sem filial a tabela vem zerada, com 14 linhas", () => {
  [{ contas: [] }, { filiais: [] }].forEach((extra) => {
    const lista = linhas(extra);
    assert.equal(lista.length, 14, "12 meses + total + média");
    lista.forEach((linha) => assert.equal(linha.realizado, 0));
  });
});

test("módulo inexistente devolve zeros em vez de estourar", () => {
  assert.equal(totalDe(linhas({ moduloId: "nao-existe" })).planejado, 0);
});

test("módulo de despesa lê o realizado invertido", () => {
  const comDebito = indexarRealizado([
    { classificacao: "4.4.1.01", filial: "000001", centro: "002", mes: 1, debito: 1500, credito: 0 },
  ]);
  const lista = linhas({ moduloId: DESPESA, contas: ["4.4.1.01"], realizado: comDebito });
  assert.equal(mes(lista, 1).realizado, 1500);
});

// A regressão que motivou estes testes: o realizado dividia pelos meses com
// dado e o planejado por 12, então a Variação da linha Média comparava uma média
// de 8 meses com uma de 12. O número não significava nada e ainda aparecia em
// verde, como ganho, com o ano atrás do anterior.
test("média divide TODAS as colunas por 12", () => {
  const lista = linhas();
  const total = totalDe(lista);
  const media = mediaDe(lista);

  assert.equal(media.planejado, total.planejado / 12);
  assert.equal(media.realizado, total.realizado / 12);
  assert.equal(media.anterior, total.anterior / 12);
});

test("a variação da média compara colunas do mesmo divisor", () => {
  const lista = linhas();
  const total = totalDe(lista);
  const media = mediaDe(lista);

  // Se as três dividem igual, a variação da média é a do total ÷ 12 — e é isso
  // que torna a linha comparável coluna a coluna.
  assert.ok(Math.abs(media.variacao - total.variacao / 12) < 1e-9);
  assert.equal(media.variacao, media.realizado - media.anterior);
});

// Um mês com realizado zero não pode "sumir" da conta: no meio do ano a média é
// um doze avos do ano, e não o ritmo mensal. Achatada de propósito.
test("meses que ainda não chegaram entram como zero na média", () => {
  const lista = linhas();
  const media = mediaDe(lista);
  const soma = lista
    .filter((linha) => typeof linha.id === "number")
    .reduce((acumulado, linha) => acumulado + linha.realizado, 0);

  assert.equal(media.realizado, soma / 12);
});

// ---------------------------------------------------------------------------
// Total do ano por módulo
// ---------------------------------------------------------------------------

test("totalPlanejadoNoAno soma as contas de cada filial pela visão", () => {
  let visao = definirContasDaFilial(criarVisao("v1", "X", "25"), MODULO, "000001", [CONTA]);
  visao = definirContasDaFilial(visao, MODULO, "000025", [CONTA, OUTRA_CONTA]);

  const digitado = {
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 10,
    [chavePlanejado(MODULO, "000025", SEM_CENTRO, OUTRA_CONTA, 12)]: 90,
    // Conta que a visão não deu para esta filial: não entra.
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, OUTRA_CONTA, 5)]: 5000,
  };

  const total = totalPlanejadoNoAno({
    plano: plano(digitado),
    visao,
    moduloId: MODULO,
    filiais: FILIAIS,
  });
  assert.equal(total, 100);
});

test("totalPlanejadoNoAno é zero em módulo não configurado", () => {
  const total = totalPlanejadoNoAno({
    plano: plano(),
    visao: criarVisao("v1", "X", "25"),
    moduloId: MODULO,
    filiais: FILIAIS,
  });
  assert.equal(total, 0);
});

test("módulo com centro soma o planejado de cada centro", () => {
  // Em módulo com centro a tela só grava com um centro escolhido — não existe
  // valor sob SEM_CENTRO. Descer por centro é o que faz a linha do DRE fechar
  // com o que está na tela do módulo.
  let visao = definirUsaCentroDeCusto(criarVisao("v1", "X", "25"), DESPESA, true);
  visao = definirContasDaFilial(visao, DESPESA, "000001", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, "000001", "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, "000001", "008", ["4.4.1.01"]);

  const digitado = {
    [chavePlanejado(DESPESA, "000001", "002", "4.4.1.01", 1)]: 42,
    [chavePlanejado(DESPESA, "000001", "008", "4.4.1.01", 1)]: 8,
    // Chave sem centro não é alcançável pela tela; se aparecer, é lixo.
    [chavePlanejado(DESPESA, "000001", SEM_CENTRO, "4.4.1.01", 1)]: 999,
  };
  assert.equal(
    totalPlanejadoNoAno({ plano: plano(digitado), visao, moduloId: DESPESA, filiais: FILIAIS }),
    50
  );
});

// ---------------------------------------------------------------------------
// Filial removida do ERP
// ---------------------------------------------------------------------------

test("purgar filial limpa as edições dela em todos os planos", () => {
  const planos = [
    plano({
      [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 100,
      [chavePlanejado(MODULO, "000025", SEM_CENTRO, CONTA, 1)]: 200,
    }),
    { ...plano({ [chavePlanejado(MODULO, "000001", "002", CONTA, 5)]: 300 }), id: "p2" },
  ];

  const [p1, p2] = purgarFilialDosPlanos(planos, "000001");
  assert.deepEqual(Object.keys(p1.planejado), [
    chavePlanejado(MODULO, "000025", SEM_CENTRO, CONTA, 1),
  ]);
  assert.deepEqual(Object.keys(p2.planejado), []);
});

test("purgar filial sem edições devolve o mesmo objeto", () => {
  // Evita recriar o plano (e disparar re-render) quando nada mudou.
  const planos = [plano()];
  assert.equal(purgarFilialDosPlanos(planos, "000001")[0], planos[0]);
});

// ---------------------------------------------------------------------------
// Módulo percentual
//
// Em Deduções de vendas e Custos variáveis o que se digita é o percentual sobre
// uma CONTA DE RECEITA específica — o mesmo recorte do Scoreplan, que pede
// produto/serviço e dedução antes de aceitar o número. A chave ganha a receita
// no fim; o valor em reais é derivado.
// ---------------------------------------------------------------------------

const catalogoDeContas = indexarContas([
  { codigo: CONTA, descricao: "COLEÇÃO", totalizaEm: null, sintetica: false, grupo: "R" },
  { codigo: OUTRA_CONTA, descricao: "SALDO", totalizaEm: null, sintetica: false, grupo: "R" },
  { codigo: "3.1.2.01.001", descricao: "DEVOLUÇÃO", totalizaEm: null, sintetica: false, grupo: "DV" },
  { codigo: "3.1.2.01.002", descricao: "ICMS S/ DEV.", totalizaEm: null, sintetica: false, grupo: "DV" },
]);

const PERCENTUAL = "deducoes-vendas";
const CONTA_DEDUCAO = "3.1.2.01.001";
const OUTRA_DEDUCAO = "3.1.2.01.002";

// Receita planejada em janeiro: 1.000 em CONTA e 4.000 em OUTRA_CONTA, ambas na
// filial 000001.
function visaoComReceita() {
  let visao = definirContasDaFilial(criarVisao("v1", "X", "25"), MODULO, "000001", [
    CONTA,
    OUTRA_CONTA,
  ]);
  return definirContasDaFilial(visao, PERCENTUAL, "000001", [CONTA_DEDUCAO, OUTRA_DEDUCAO]);
}

const RECEITA = {
  [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 1000,
  [chavePlanejado(MODULO, "000001", SEM_CENTRO, OUTRA_CONTA, 1)]: 4000,
};

const linhasPercentuais = (planejado, extra) =>
  criarLinhasOrcamento({
    plano: plano({ ...RECEITA, ...planejado }),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: [FILIAIS[0]],
    centroId: SEM_CENTRO,
    contas: [CONTA_DEDUCAO],
    realizado: indexarRealizado([]),
    realizadoAnterior: indexarRealizado([]),
    ...extra,
  });

test("a chave do módulo percentual carrega a conta de receita", () => {
  assert.equal(
    chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, CONTA),
    `${PERCENTUAL}|000001||${CONTA_DEDUCAO}|1|${CONTA}`
  );
  // Sem receita, a chave continua com cinco segmentos — módulo em reais.
  assert.equal(
    chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1),
    `${MODULO}|000001||${CONTA}|1`
  );
});

test("receitasDaBase lista as contas de receita da filial", () => {
  assert.deepEqual(receitasDaBase(visaoComReceita(), "000001"), [CONTA, OUTRA_CONTA]);
  assert.deepEqual(receitasDaBase(visaoComReceita(), "000025"), []);
});

test("o percentual incide sobre a receita contra a qual foi lançado", () => {
  // 10% sobre a receita de 1.000 e 5% sobre a de 4.000: 100 + 200.
  const lista = linhasPercentuais({
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, CONTA)]: 10,
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, OUTRA_CONTA)]: 5,
  });

  assert.equal(mes(lista, 1).planejado, 300);
  assert.equal(mes(lista, 1).planejadoPercentual, 15);
  assert.equal(mes(lista, 1).base, 5000);
});

test("filtrar uma receita restringe a base e o valor", () => {
  const digitado = {
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, CONTA)]: 10,
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, OUTRA_CONTA)]: 5,
  };

  const soAPrimeira = linhasPercentuais(digitado, { receitas: [CONTA] });
  assert.equal(mes(soAPrimeira, 1).planejado, 100);
  assert.equal(mes(soAPrimeira, 1).base, 1000);

  const soASegunda = linhasPercentuais(digitado, { receitas: [OUTRA_CONTA] });
  assert.equal(mes(soASegunda, 1).planejado, 200);
  assert.equal(mes(soASegunda, 1).base, 4000);
});

test("percentual lançado contra outra receita não entra na conta filtrada", () => {
  const lista = linhasPercentuais(
    { [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, OUTRA_CONTA)]: 5 },
    { receitas: [CONTA] }
  );
  assert.equal(mes(lista, 1).planejado, 0);
  assert.equal(mes(lista, 1).planejadoPercentual, 0);
});

test("percentual do total é valor ÷ base, não a soma dos meses", () => {
  const lista = linhasPercentuais({
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, CONTA)]: 10,
  });

  const total = totalDe(lista);
  assert.equal(total.planejado, 100);
  assert.equal(total.base, 5000);
  assert.equal(total.planejadoPercentual, 2); // 100 / 5.000, não os 10 digitados
  assert.equal(mediaDe(lista).planejadoPercentual, null);
});

test("sem receita planejada o percentual não vira valor", () => {
  const lista = criarLinhasOrcamento({
    plano: plano({
      [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, CONTA)]: 10,
    }),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: [FILIAIS[0]],
    contas: [CONTA_DEDUCAO],
    realizado: indexarRealizado([]),
    realizadoAnterior: indexarRealizado([]),
  });

  assert.equal(mes(lista, 1).planejadoPercentual, 10);
  assert.equal(mes(lista, 1).planejado, 0);
  assert.equal(totalDe(lista).base, 0);
});

test("módulo em reais não ganha coluna de percentual", () => {
  assert.equal(mes(linhas(), 1).planejadoPercentual, null);
});

test("o total do ano de um módulo percentual sai em reais", () => {
  const total = totalPlanejadoNoAno({
    plano: plano({
      ...RECEITA,
      [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1, CONTA)]: 10,
    }),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: FILIAIS,
  });
  assert.equal(total, 100);
});

// ---------------------------------------------------------------------------
// Realizado %
//
// A base é a receita REALIZADA do mês, não a planejada: é o que torna a coluna
// comparável com Planejado %, já que as duas passam a ser fatia da receita do
// próprio período.
// ---------------------------------------------------------------------------

test("realizado % é o realizado sobre a receita realizada do mês", () => {
  const realizadoDoAno = indexarRealizado(
    [
      // Receita: 1.000 em janeiro (cresce a crédito).
      { classificacao: CONTA, filial: "000001", centro: "001", mes: 1, debito: 0, credito: 1000 },
      // Dedução: 170 no mesmo mês (cresce a débito).
      { classificacao: CONTA_DEDUCAO, filial: "000001", centro: "001", mes: 1, debito: 170, credito: 0 },
    ],
    "25"
  );

  const lista = criarLinhasOrcamento({
    plano: plano(RECEITA),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: [FILIAIS[0]],
    contas: [CONTA_DEDUCAO],
    receitas: [CONTA],
    catalogo: catalogoDeContas,
    realizado: realizadoDoAno,
    realizadoAnterior: indexarRealizado([], "25"),
  });

  assert.equal(mes(lista, 1).baseRealizada, 1000);
  assert.equal(mes(lista, 1).realizadoPercentual, 17);
  assert.equal(totalDe(lista).realizadoPercentual, 17);
  assert.equal(mediaDe(lista).realizadoPercentual, null);
});

test("sem receita realizada o percentual é zero, não infinito", () => {
  const soDeducao = indexarRealizado(
    [{ classificacao: CONTA_DEDUCAO, filial: "000001", centro: "001", mes: 1, debito: 170, credito: 0 }],
    "25"
  );
  const lista = criarLinhasOrcamento({
    plano: plano(RECEITA),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: [FILIAIS[0]],
    contas: [CONTA_DEDUCAO],
    receitas: [CONTA],
    catalogo: catalogoDeContas,
    realizado: soDeducao,
    realizadoAnterior: indexarRealizado([], "25"),
  });

  assert.equal(mes(lista, 1).realizado, 170);
  assert.equal(mes(lista, 1).baseRealizada, 0);
  assert.equal(mes(lista, 1).realizadoPercentual, 0);
});

test("módulo em reais não tem realizado %", () => {
  assert.equal(mes(linhas(), 1).realizadoPercentual, null);
});

// --------------------------------------------------------------------------
// O que fica gravado a partir do que foi digitado
//
// A regressão que motivou estes testes: em módulo NÃO percentual a única coluna
// também se chama `reais`, e a conversão para percentual rodava lá. A base valia
// zero, todo valor digitado virava 0, e o servidor apagava a linha — digitar não
// gravava nada, em quatro dos oito módulos.
// --------------------------------------------------------------------------

test("módulo em reais grava o que foi digitado, não uma conversão", () => {
  assert.equal(
    valorParaGravar({ digitado: 123456.78, emReais: true, percentual: false, base: 0 }),
    123456.78
  );
});

test("a base do módulo percentual não interfere no módulo em reais", () => {
  // Mesmo com base disponível, módulo em reais não converte.
  assert.equal(
    valorParaGravar({ digitado: 5000, emReais: true, percentual: false, base: 200000 }),
    5000
  );
});

test("módulo percentual: digitar o percentual grava o percentual", () => {
  assert.equal(
    valorParaGravar({ digitado: 38.959531, emReais: false, percentual: true, base: 200000 }),
    38.959531
  );
});

test("módulo percentual: digitar em reais grava o percentual equivalente", () => {
  assert.equal(
    valorParaGravar({ digitado: 50000, emReais: true, percentual: true, base: 200000 }),
    25
  );
});

test("módulo percentual sem base não inventa percentual", () => {
  assert.equal(
    valorParaGravar({ digitado: 50000, emReais: true, percentual: true, base: 0 }),
    0
  );
});

test("zero continua zero em qualquer caminho — é o que apaga a célula", () => {
  for (const caso of [
    { digitado: 0, emReais: true, percentual: false, base: 0 },
    { digitado: 0, emReais: false, percentual: true, base: 200000 },
    { digitado: 0, emReais: true, percentual: true, base: 200000 },
  ]) {
    assert.equal(valorParaGravar(caso), 0, JSON.stringify(caso));
  }
});

// ---------------------------------------------------------------------------
// Vs. orçado
//
// Coluna própria em vez de trocar o sentido da Variação % na linha Total. No
// Scoreplan as duas dividem a mesma coluna: as linhas mensais comparam com o ano
// anterior e o Total, com o planejado — mantendo o Variação $ contra o anterior.
// Duas perguntas sob um rótulo só.
// ---------------------------------------------------------------------------

test("vs. orçado compara realizado com planejado, não com o ano anterior", () => {
  const digitado = { [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 1000 };
  const lista = linhas({ plano: plano(digitado), filiais: [FILIAIS[0]] });

  // Mês 1: planejado 1000, realizado 1000 (do índice), anterior 800.
  assert.equal(mes(lista, 1).vsOrcado, 0, "realizou exatamente o orçado");
  assert.equal(mes(lista, 1).variacaoPercentual, 25, "mas 25% acima do ano anterior");
});

test("sem orçamento no período a coluna fica vazia, não zerada", () => {
  const lista = linhas();
  // Nada digitado: não existe atingimento a calcular.
  assert.equal(mes(lista, 1).vsOrcado, null);
  assert.equal(totalDe(lista).vsOrcado, null);
});

test("vs. orçado do total usa os totais do ano", () => {
  const digitado = {
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 4000,
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 2)]: 4000,
  };
  const lista = linhas({ plano: plano(digitado), filiais: [FILIAIS[0]] });
  const total = totalDe(lista);

  // Planejado 8000, realizado 3000 (1000 em janeiro + 2000 em fevereiro).
  assert.equal(total.planejado, 8000);
  assert.equal(total.realizado, 3000);
  assert.equal(total.vsOrcado, ((3000 - 8000) / 8000) * 100);
});

test("a média divide as duas colunas por 12, então a taxa é a mesma do total", () => {
  const digitado = {
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 4000,
    [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 2)]: 4000,
  };
  const lista = linhas({ plano: plano(digitado), filiais: [FILIAIS[0]] });

  assert.ok(Math.abs(mediaDe(lista).vsOrcado - totalDe(lista).vsOrcado) < 1e-9);
});
