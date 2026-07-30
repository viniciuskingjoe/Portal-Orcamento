import { strict as assert } from "node:assert";
import { test } from "node:test";

import { MODULOS } from "../src/dados/modulos.js";
import {
  SEM_CENTRO,
  centrosDaFilial,
  contasDaFilial,
  contasDoCentro,
  contasEfetivasDoModulo,
  criarVisao,
  definirContasDaFilial,
  definirContasDoCentro,
  definirUsaCentroDeCusto,
  filiaisDoModulo,
  moduloConfigurado,
  modulosDaVisao,
  resumoDaVisao,
  usaCentroDeCusto,
} from "../src/dados/visao.js";

const MODULO = "receita-vendas";
const DESPESA = "despesas-operacionais";
const FILIAL = "000025";
const OUTRA = "000001";

const nova = () => criarVisao("v1", "DRE 2026", "25");

test("visão nova guarda a visão contábil e não tem módulo configurado", () => {
  const visao = nova();
  assert.equal(visao.visaoContabil, "25");
  assert.deepEqual(modulosDaVisao(visao), []);
  assert.equal(moduloConfigurado(visao, MODULO), false);
});

test("contas são por filial, não do módulo inteiro", () => {
  let visao = definirContasDaFilial(nova(), MODULO, FILIAL, ["3.1.1.01.001"]);
  visao = definirContasDaFilial(visao, MODULO, OUTRA, ["3.1.1.01.002", "3.1.1.01.003"]);

  assert.deepEqual(contasDaFilial(visao, MODULO, FILIAL), ["3.1.1.01.001"]);
  assert.deepEqual(contasDaFilial(visao, MODULO, OUTRA), ["3.1.1.01.002", "3.1.1.01.003"]);
  assert.deepEqual(filiaisDoModulo(visao, MODULO).sort(), [OUTRA, FILIAL].sort());
});

test("filial sem conta não conta como configurada", () => {
  const visao = definirContasDaFilial(nova(), MODULO, FILIAL, []);
  assert.deepEqual(filiaisDoModulo(visao, MODULO), []);
  assert.equal(moduloConfigurado(visao, MODULO), false);
});

test("definir contas não muta a visão original", () => {
  const original = nova();
  const proxima = definirContasDaFilial(original, MODULO, FILIAL, ["3.1.1.01.001"]);
  assert.deepEqual(original.modulos, {});
  assert.notEqual(original, proxima);
});

// ---------------------------------------------------------------------------
// Centro de custo
// ---------------------------------------------------------------------------

test("centro de custo é opcional por módulo", () => {
  const visao = nova();
  assert.equal(usaCentroDeCusto(visao, MODULO), false);
  assert.equal(usaCentroDeCusto(definirUsaCentroDeCusto(visao, DESPESA, true), DESPESA), true);
});

test("conta do centro precisa estar entre as da filial", () => {
  // A regra fica no modelo, não só na tela: o centro é subconjunto da filial.
  let visao = definirUsaCentroDeCusto(nova(), DESPESA, true);
  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01", "9.9.9"]);

  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), ["4.4.1.01"]);
});

test("tirar conta da filial tira dos centros dela", () => {
  // Sem isso a soma do centro incluiria o que a filial não orça mais.
  let visao = definirUsaCentroDeCusto(nova(), DESPESA, true);
  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01", "4.4.1.02"]);

  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.02"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), ["4.4.1.02"]);
});

test("centro que fica sem conta some da lista", () => {
  let visao = definirUsaCentroDeCusto(nova(), DESPESA, true);
  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["002"]);

  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.09"]);
  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), []);
});

test("contas efetivas: sem centro usa as da filial, com centro usa o subconjunto", () => {
  let visao = definirUsaCentroDeCusto(nova(), DESPESA, true);
  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);

  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL), ["4.4.1.01", "4.4.1.02"]);
  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL, SEM_CENTRO), [
    "4.4.1.01",
    "4.4.1.02",
  ]);
  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL, "002"), ["4.4.1.01"]);
});

test("módulo que não usa centro ignora o centro pedido", () => {
  // Evita que um filtro de centro esvazie um módulo que não tem essa dimensão.
  const visao = definirContasDaFilial(nova(), MODULO, FILIAL, ["3.1.1.01.001"]);
  assert.deepEqual(contasEfetivasDoModulo(visao, MODULO, FILIAL, "002"), ["3.1.1.01.001"]);
});

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------

test("resumo conta módulos, filiais e contas", () => {
  let visao = definirContasDaFilial(nova(), MODULO, FILIAL, ["3.1.1.01.001", "3.1.1.01.002"]);
  visao = definirContasDaFilial(visao, MODULO, OUTRA, ["3.1.1.01.001"]);
  visao = definirContasDaFilial(visao, DESPESA, FILIAL, ["4.4.1.01"]);

  const resumo = resumoDaVisao(visao);
  assert.equal(resumo.modulos, 2);
  assert.equal(resumo.filiais, 2, "filial repetida entre módulos conta uma vez");
  assert.equal(resumo.contas, 4);
  assert.equal(resumo.totalDeModulos, MODULOS.length);
});

test("os oito módulos fixos têm tipo e grupo contábil", () => {
  assert.equal(MODULOS.length, 8);
  MODULOS.forEach((item) => {
    assert.ok(["receita", "despesa"].includes(item.tipo), `${item.id} sem tipo`);
    assert.ok(["R", "DV", "DF"].includes(item.grupo), `${item.id} sem grupo`);
  });
});
