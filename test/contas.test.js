import { strict as assert } from "node:assert";
import { test } from "node:test";

import { conta, expandirComDescendentes, indexarContas } from "../src/dados/contas.js";

// Recorte real do que /api/contas devolve (dbo.CTB_VISAO, visão 03).
const BRUTO = [
  { codigo: "3", descricao: "RECEITA DO EXERCÍCIO", totalizaEm: "3.1.2", sintetica: true },
  { codigo: "3.1", descricao: "RECEITA OPERACIONAL", totalizaEm: "3", sintetica: true },
  { codigo: "3.1.1", descricao: "RECEITA BRUTA DE VENDAS", totalizaEm: "3.1", sintetica: true },
  { codigo: "3.1.1.1", descricao: "VENDA DE MERCADORIA", totalizaEm: "3.1.1", sintetica: true },
  { codigo: "3.1.1.1.01", descricao: "BAZAR", totalizaEm: "3.1.1.1", sintetica: false },
  { codigo: "3.1.1.1.02", descricao: "COLEÇÃO", totalizaEm: "3.1.1.1", sintetica: false },
  { codigo: "3.1.1.3", descricao: "(-)", totalizaEm: "3.1.2", sintetica: true },
  { codigo: "3.1.1.3.01", descricao: "VENDAS CANCELADAS/DEVOLVIDAS", totalizaEm: "3.1.1.3", sintetica: false },
];

const catalogo = indexarContas(BRUTO);

test("nível vem da quantidade de segmentos do código", () => {
  assert.equal(conta(catalogo, "3").nivel, 0);
  assert.equal(conta(catalogo, "3.1").nivel, 1);
  assert.equal(conta(catalogo, "3.1.1.1.02").nivel, 4);
});

test("catálogo vazio não quebra", () => {
  const vazio = indexarContas(undefined);
  assert.deepEqual(vazio.lista, []);
  assert.equal(conta(vazio, "3"), null);
  assert.deepEqual([...expandirComDescendentes(vazio, ["3"])], ["3"]);
});

test("conta inexistente devolve null", () => {
  assert.equal(conta(catalogo, "9.9.9"), null);
});

test("marcar uma sintética vale pelos descendentes", () => {
  // Sintética não recebe lançamento: o movimento fica nas folhas. Sem a
  // expansão, selecionar "3.1.1.1 VENDA DE MERCADORIA" daria total zero.
  const codigos = expandirComDescendentes(catalogo, ["3.1.1.1"]);
  assert.deepEqual([...codigos].sort(), ["3.1.1.1", "3.1.1.1.01", "3.1.1.1.02"]);
});

test("expansão desce a hierarquia inteira", () => {
  const codigos = expandirComDescendentes(catalogo, ["3.1.1"]);
  assert.ok(codigos.has("3.1.1.1"), "filho tem que entrar");
  assert.ok(codigos.has("3.1.1.1.02"), "neto tem que entrar");
});

test("a hierarquia segue totalizaEm, não o prefixo do código", () => {
  // No ERP, "3.1.1.3" totaliza em "3.1.2" — o código parece filho de "3.1.1"
  // mas não é. Expandir por prefixo de string somaria no lugar errado.
  const codigos = expandirComDescendentes(catalogo, ["3.1.1"]);
  assert.ok(!codigos.has("3.1.1.3"), "3.1.1.3 totaliza em 3.1.2");
  assert.ok(!codigos.has("3.1.1.3.01"));

  assert.ok(expandirComDescendentes(catalogo, ["3.1.1.3"]).has("3.1.1.3.01"));
});

test("pai e filho selecionados juntos não duplicam", () => {
  // Devolve Set justamente para isso: com array o valor da folha entraria duas
  // vezes na soma do realizado.
  const codigos = expandirComDescendentes(catalogo, ["3.1.1.1", "3.1.1.1.02"]);
  assert.equal(codigos.size, 3);
});

test("folha expande só para ela mesma", () => {
  assert.deepEqual([...expandirComDescendentes(catalogo, ["3.1.1.1.02"])], ["3.1.1.1.02"]);
});

test("código fora do catálogo é mantido, não descartado", () => {
  // A visão pode referenciar uma classificação que saiu do ERP; sumir com ela em
  // silêncio esconderia o problema.
  assert.ok(expandirComDescendentes(catalogo, ["9.9"]).has("9.9"));
});

test("hierarquia cíclica não trava a expansão", () => {
  // "3" totaliza em "3.1.2" e "3.1" totaliza em "3": o próprio ERP tem ciclo.
  const ciclico = indexarContas([
    { codigo: "A", descricao: "a", totalizaEm: "B", sintetica: true },
    { codigo: "B", descricao: "b", totalizaEm: "A", sintetica: true },
  ]);
  const codigos = expandirComDescendentes(ciclico, ["A"]);
  assert.deepEqual([...codigos].sort(), ["A", "B"]);
});
