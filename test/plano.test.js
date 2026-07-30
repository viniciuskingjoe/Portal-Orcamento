import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  purgarFilialDosPlanos,
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
import { mesesComRealizado } from "../src/dados/calendario.js";

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

test("média divide pelos meses com dado, não por 12 fixo", () => {
  const lista = linhas();
  const total = totalDe(lista);
  const media = mediaDe(lista);
  const comDado = mesesComRealizado(ANO);

  assert.equal(media.planejado, total.planejado / 12);
  if (comDado > 0 && comDado < 12) assert.equal(media.realizado, total.realizado / comDado);
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

test("módulo com centro usa as contas da filial no total do ano", () => {
  // O total do ano é consolidado: soma a filial inteira, não centro a centro.
  let visao = definirUsaCentroDeCusto(criarVisao("v1", "X", "25"), DESPESA, true);
  visao = definirContasDaFilial(visao, DESPESA, "000001", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, "000001", "002", ["4.4.1.01"]);

  const digitado = { [chavePlanejado(DESPESA, "000001", SEM_CENTRO, "4.4.1.01", 1)]: 42 };
  assert.equal(
    totalPlanejadoNoAno({ plano: plano(digitado), visao, moduloId: DESPESA, filiais: FILIAIS }),
    42
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
// a receita de vendas planejada. O que fica gravado é o percentual; o valor em
// reais é derivado.
// ---------------------------------------------------------------------------

const PERCENTUAL = "deducoes-vendas";
const CONTA_DEDUCAO = "3.1.2.01.001";

// Receita planejada: 1.000 na 000001 e 4.000 na 000025, tudo em janeiro.
function visaoComReceita() {
  let visao = definirContasDaFilial(criarVisao("v1", "X", "25"), MODULO, "000001", [CONTA]);
  visao = definirContasDaFilial(visao, MODULO, "000025", [CONTA]);
  return definirContasDaFilial(visao, PERCENTUAL, "000001", [CONTA_DEDUCAO]);
}

const RECEITA = {
  [chavePlanejado(MODULO, "000001", SEM_CENTRO, CONTA, 1)]: 1000,
  [chavePlanejado(MODULO, "000025", SEM_CENTRO, CONTA, 1)]: 4000,
};

const linhasPercentuais = (planejado, filiais = FILIAIS) =>
  criarLinhasOrcamento({
    plano: plano({ ...RECEITA, ...planejado }),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais,
    centroId: SEM_CENTRO,
    contas: [CONTA_DEDUCAO],
    realizado: indexarRealizado([]),
    realizadoAnterior: indexarRealizado([]),
  });

test("módulo percentual guarda o percentual e deriva o valor em reais", () => {
  const lista = linhasPercentuais({
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1)]: 10,
  });

  const janeiro = mes(lista, 1);
  assert.equal(janeiro.planejadoPercentual, 10);
  assert.equal(janeiro.planejado, 100); // 10% de 1.000
  assert.equal(janeiro.base, 5000); // receita das duas filiais
});

test("o percentual de cada filial incide sobre a receita daquela filial", () => {
  // Mesmos 10% nas duas filiais, bases diferentes: 10% de 1.000 + 10% de 4.000.
  // Somar os percentuais (20%) e aplicar na base total (5.000) daria 1.000.
  const lista = linhasPercentuais({
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1)]: 10,
    [chavePlanejado(PERCENTUAL, "000025", SEM_CENTRO, CONTA_DEDUCAO, 1)]: 10,
  });

  assert.equal(mes(lista, 1).planejado, 500);
  assert.equal(mes(lista, 1).planejadoPercentual, 20);
});

test("percentual do total é valor ÷ base, não a soma dos meses", () => {
  const lista = linhasPercentuais({
    [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1)]: 10,
  });

  const total = totalDe(lista);
  assert.equal(total.planejado, 100);
  assert.equal(total.base, 5000);
  assert.equal(total.planejadoPercentual, 2); // 100 / 5.000, não os 10 digitados
  assert.equal(mediaDe(lista).planejadoPercentual, null);
});

test("sem receita planejada o percentual não vira valor", () => {
  const lista = criarLinhasOrcamento({
    plano: plano({ [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1)]: 10 }),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: FILIAIS,
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
      [chavePlanejado(PERCENTUAL, "000001", SEM_CENTRO, CONTA_DEDUCAO, 1)]: 10,
    }),
    visao: visaoComReceita(),
    moduloId: PERCENTUAL,
    filiais: FILIAIS,
  });
  assert.equal(total, 100);
});
