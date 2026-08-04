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
  definirContasDoCentro,
  definirUsoDoCentro,
  centroEmUso,
  filiaisDoModulo,
  moduloConfigurado,
  modulosDaVisao,
  resumoDaVisao,
  usaCentroDeCusto,
} from "../src/dados/visao.js";

const MODULO = "receita-vendas";
const DESPESA = "despesas-operacionais";
const FILIAL = "000025";
// Todo módulo é orçado por centro: montar a visão passa sempre por um.
const CENTRO = "002";
const OUTRA = "000001";

const nova = () => criarVisao("v1", "DRE 2026", "25");

test("visão nova guarda a visão contábil e não tem módulo configurado", () => {
  const visao = nova();
  assert.equal(visao.visaoContabil, "25");
  assert.deepEqual(modulosDaVisao(visao), []);
  assert.equal(moduloConfigurado(visao, MODULO), false);
});

test("contas são por filial, não do módulo inteiro", () => {
  let visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  visao = definirContasDoCentro(visao, MODULO, OUTRA, CENTRO, ["3.1.1.01.002", "3.1.1.01.003"]);

  assert.deepEqual(contasDaFilial(visao, MODULO, FILIAL), ["3.1.1.01.001"]);
  assert.deepEqual(contasDaFilial(visao, MODULO, OUTRA), ["3.1.1.01.002", "3.1.1.01.003"]);
  assert.deepEqual(filiaisDoModulo(visao, MODULO).sort(), [OUTRA, FILIAL].sort());
});

test("filial sem conta não conta como configurada", () => {
  const visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, []);
  assert.deepEqual(filiaisDoModulo(visao, MODULO), []);
  assert.equal(moduloConfigurado(visao, MODULO), false);
});

test("definir contas não muta a visão original", () => {
  const original = nova();
  const proxima = definirContasDoCentro(original, MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  assert.deepEqual(original.modulos, {});
  assert.notEqual(original, proxima);
});

// ---------------------------------------------------------------------------
// Centro de custo
// ---------------------------------------------------------------------------

// Já foi opcional, com um interruptor por módulo na tela. O resultado era que
// "de qual centro é esta despesa?" tinha resposta em alguns módulos e não em
// outros, o que impedia qualquer leitura por centro atravessando o DRE.
test("todo módulo é orçado por centro de custo", () => {
  const visao = nova();
  MODULOS.forEach((modulo) => {
    assert.equal(usaCentroDeCusto(visao, modulo.id), true, modulo.id);
  });
});

test("com centro, as contas da filial são a união dos centros", () => {
  // A ordem de uso é filial -> centros -> contas de cada centro. A lista da
  // filial deixa de ser escolha e vira o consolidado, que é o que a tela do
  // plano e o DRE leem.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "008", ["4.4.1.02", "4.4.1.09"]);

  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), ["4.4.1.01", "4.4.1.02", "4.4.1.09"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "008"), ["4.4.1.02", "4.4.1.09"]);
});

test("o centro não é mais recortado pela filial", () => {
  // Antes o centro escolhia entre as contas da filial; agora é ele quem define.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), ["4.4.1.01"]);
});

test("marcar o centro coloca ele em uso ainda sem conta", () => {
  let visao = nova();
  visao = definirUsoDoCentro(visao, DESPESA, FILIAL, "002", true);

  assert.equal(centroEmUso(visao, DESPESA, FILIAL, "002"), true);
  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["002"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), []);
  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), []);
});

test("desmarcar o centro leva as contas dele embora", () => {
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "008", ["4.4.1.02"]);

  visao = definirUsoDoCentro(visao, DESPESA, FILIAL, "002", false);
  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["008"]);
  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), ["4.4.1.02"]);
});

test("tirar conta da filial tira dos centros dela", () => {
  // Sem isso a soma do centro incluiria o que a filial não orça mais.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, CENTRO, ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01", "4.4.1.02"]);

  visao = definirContasDoCentro(visao, DESPESA, FILIAL, CENTRO, ["4.4.1.02"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), ["4.4.1.02"]);
});

test("centro esvaziado continua em uso", () => {
  // Vazio é um estado legítimo: o centro foi marcado e as contas ainda não.
  // Quem tira o centro do ar é a caixa de uso, não a falta de conta.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", []);

  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["002"]);
  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), []);
});

test("contas efetivas: sem centro é o consolidado, com centro é o do centro", () => {
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "008", ["4.4.1.02"]);

  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL), ["4.4.1.01", "4.4.1.02"]);
  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL, SEM_CENTRO), [
    "4.4.1.01",
    "4.4.1.02",
  ]);
  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL, "002"), ["4.4.1.01"]);
});

test("módulo que não usa centro ignora o centro pedido", () => {
  // Evita que um filtro de centro esvazie um módulo que não tem essa dimensão.
  const visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  assert.deepEqual(contasEfetivasDoModulo(visao, MODULO, FILIAL, "002"), ["3.1.1.01.001"]);
});

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------

test("resumo conta módulos, filiais e contas", () => {
  let visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001", "3.1.1.01.002"]);
  visao = definirContasDoCentro(visao, MODULO, OUTRA, CENTRO, ["3.1.1.01.001"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, CENTRO, ["4.4.1.01"]);

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
