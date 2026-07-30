import { strict as assert } from "node:assert";
import { test } from "node:test";

import { indexarContas } from "../src/dados/contas.js";
import {
  contasDoMapeamento,
  inversoesDoMapeamento,
  temMapeamentoPadrao,
} from "../src/dados/mapeamentoPadrao.js";

const catalogo = indexarContas([
  { codigo: "3.1.1.01", descricao: "RECEITA BRUTA", totalizaEm: null, sintetica: true, grupo: "R" },
  { codigo: "3.1.1.01.001", descricao: "COLEÇÃO", totalizaEm: "3.1.1.01", sintetica: false, grupo: "R" },
  { codigo: "3.1.1.01.005", descricao: "MOSTRUÁRIO", totalizaEm: "3.1.1.01", sintetica: false, grupo: "R" },
  { codigo: "3.1.2.01", descricao: "DEVOLUÇÕES", totalizaEm: null, sintetica: true, grupo: "DF" },
  { codigo: "3.1.2.01.001", descricao: "DEVOLUÇÃO VENDAS", totalizaEm: "3.1.2.01", sintetica: false, grupo: "DV" },
  { codigo: "4.4.4.01", descricao: "OUTRAS", totalizaEm: null, sintetica: true, grupo: "DF" },
  { codigo: "4.4.4.01.001", descricao: "OUTRAS X", totalizaEm: "4.4.4.01", sintetica: false, grupo: "DF" },
  { codigo: "4.6.5.01.001", descricao: "INDENIZAÇÃO DE SEGUROS", totalizaEm: null, sintetica: false, grupo: "DF" },
]);

test("o mapeamento padrão só vale para a visão contábil 25", () => {
  assert.equal(temMapeamentoPadrao("25"), true);
  assert.equal(temMapeamentoPadrao("21"), false);
  assert.equal(temMapeamentoPadrao(null), false);
});

test("receita de vendas usa lista fechada, não faixa", () => {
  // O Scoreplan deixa 3.1.1.01.005 (mostruário) de fora de propósito.
  const contas = contasDoMapeamento(catalogo, "receita-vendas");
  assert.deepEqual(contas, ["3.1.1.01.001"]);
});

test("deduções pega a faixa inteira, só as folhas", () => {
  // Sintética não recebe lançamento e a tela do plano não a oferece.
  assert.deepEqual(contasDoMapeamento(catalogo, "deducoes-vendas"), ["3.1.2.01.001"]);
});

test("outras despesas pega os prefixos configurados", () => {
  const contas = contasDoMapeamento(catalogo, "outras-despesas");
  assert.ok(contas.includes("4.4.4.01.001"));
  assert.ok(contas.includes("4.6.5.01.001"));
  assert.ok(!contas.includes("4.4.4.01"), "sintética fica de fora");
});

test("módulo sem equivalente no Scoreplan devolve vazio", () => {
  // Receitas não operacionais e Despesas com pessoal não existem lá.
  assert.deepEqual(contasDoMapeamento(catalogo, "receitas-nao-operacionais"), []);
  assert.deepEqual(contasDoMapeamento(catalogo, "despesas-pessoal"), []);
});

test("inversões cobrem as contas de receita marcadas como despesa no ERP", () => {
  // 4.6.5.01 é INDENIZAÇÃO DE SEGUROS: receita cadastrada como DF.
  assert.deepEqual(inversoesDoMapeamento(catalogo), ["4.6.5.01.001"]);
});

test("inversões só listam o que existe no catálogo", () => {
  assert.deepEqual(inversoesDoMapeamento(indexarContas([])), []);
});
