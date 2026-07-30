import { strict as assert } from "node:assert";
import { test } from "node:test";

import { MODULOS } from "../src/dados/modulos.js";
import {
  contasDoModulo,
  criarVisao,
  definirContasDoModulo,
  moduloConfigurado,
  modulosDaVisao,
  resumoDaVisao,
} from "../src/dados/visao.js";

test("visão nova não tem módulo configurado", () => {
  const visao = criarVisao("v1", "DRE 2025");
  assert.deepEqual(modulosDaVisao(visao), []);
  assert.equal(moduloConfigurado(visao, "receita-vendas"), false);
  assert.deepEqual(contasDoModulo(visao, "receita-vendas"), []);
});

test("vincular contas configura o módulo", () => {
  let visao = criarVisao("v1", "DRE 2025");
  visao = definirContasDoModulo(visao, "receita-vendas", ["3.1.1.01.001", "3.1.1.01.002"]);

  assert.equal(moduloConfigurado(visao, "receita-vendas"), true);
  assert.deepEqual(contasDoModulo(visao, "receita-vendas"), ["3.1.1.01.001", "3.1.1.01.002"]);
  assert.deepEqual(
    modulosDaVisao(visao).map((item) => item.id),
    ["receita-vendas"]
  );
});

test("esvaziar as contas desconfigura o módulo", () => {
  // Módulo com lista vazia não entra no orçamento: não há o que somar.
  let visao = definirContasDoModulo(criarVisao("v1", "X"), "custos-variaveis", ["3.1.9.01.001"]);
  assert.equal(moduloConfigurado(visao, "custos-variaveis"), true);

  visao = definirContasDoModulo(visao, "custos-variaveis", []);
  assert.equal(moduloConfigurado(visao, "custos-variaveis"), false);
  assert.deepEqual(modulosDaVisao(visao), []);
});

test("definirContasDoModulo não muta a visão original", () => {
  const original = criarVisao("v1", "X");
  const proxima = definirContasDoModulo(original, "receita-vendas", ["3.1.1.01.001"]);

  assert.deepEqual(original.modulos, {});
  assert.notEqual(original, proxima);
});

test("resumo conta módulos e contas", () => {
  let visao = criarVisao("v1", "X");
  visao = definirContasDoModulo(visao, "receita-vendas", ["3.1.1.01.001", "3.1.1.01.002"]);
  visao = definirContasDoModulo(visao, "deducoes-vendas", ["3.1.9.02.001"]);

  const resumo = resumoDaVisao(visao);
  assert.equal(resumo.modulos, 2);
  assert.equal(resumo.contas, 3);
  assert.equal(resumo.totalDeModulos, MODULOS.length);
});

test("os oito módulos fixos existem e têm tipo", () => {
  assert.equal(MODULOS.length, 8);
  assert.deepEqual(
    MODULOS.map((item) => item.id),
    [
      "receita-vendas",
      "receitas-nao-operacionais",
      "deducoes-vendas",
      "custos-variaveis",
      "despesas-variaveis",
      "despesas-operacionais",
      "outras-despesas",
      "despesas-pessoal",
    ]
  );
  MODULOS.forEach((item) => {
    assert.ok(["receita", "despesa"].includes(item.tipo), `${item.id} sem tipo válido`);
  });
});

