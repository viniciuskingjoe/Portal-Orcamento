import assert from "node:assert/strict";
import test from "node:test";

import { analisarFormula, avaliarFormula, validarFormula } from "../src/dados/formula.js";

function resolverDe(mapa) {
  return (codigo) => {
    if (!(codigo in mapa)) throw new Error(`Conta ${codigo} não encontrada na fórmula.`);
    return mapa[codigo];
  };
}

test("soma, subtrai, multiplica e divide", () => {
  assert.equal(avaliarFormula("1 + 2", resolverDe({})), 3);
  assert.equal(avaliarFormula("5 - 2", resolverDe({})), 3);
  assert.equal(avaliarFormula("2 * 3", resolverDe({})), 6);
  assert.equal(avaliarFormula("9 / 3", resolverDe({})), 3);
});

test("precedência: multiplicação antes de soma", () => {
  assert.equal(avaliarFormula("2 + 3 * 4", resolverDe({})), 14);
});

test("parênteses vencem a precedência", () => {
  assert.equal(avaliarFormula("(2 + 3) * 4", resolverDe({})), 20);
});

test("menos unário", () => {
  assert.equal(avaliarFormula("-5 + 2", resolverDe({})), -3);
});

// O exemplo que motivou a fórmula: 13º = (salário + abono) / 12.
test("13º salário: soma duas contas e divide por 12", () => {
  const valor = avaliarFormula("(V[4.2.1.10.001] + V[4.2.1.10.002]) / 12", (codigo) =>
    resolverDe({ "4.2.1.10.001": 1200, "4.2.1.10.002": 200 })(codigo)
  );
  assert.equal(valor, (1200 + 200) / 12);
});

test("divisão por zero tem mensagem própria", () => {
  assert.throws(() => avaliarFormula("V[a] / 0", resolverDe({ a: 10 })), /divisão por zero/i);
});

test("conta que o resolvedor não conhece propaga o erro dele", () => {
  assert.throws(
    () => avaliarFormula("V[4.2.1.10.999]", resolverDe({ "4.2.1.10.001": 1 })),
    /4\.2\.1\.10\.999/
  );
});

test("fórmula vazia é erro, não zero", () => {
  assert.throws(() => analisarFormula(""), /vazia/i);
  assert.throws(() => analisarFormula("   "), /vazia/i);
});

test("parêntese sem fechar é erro claro", () => {
  assert.throws(() => analisarFormula("(1 + 2"), /fechar/i);
});

test("token inesperado ao final é erro claro", () => {
  assert.throws(() => analisarFormula("1 + 2)"), /sobrou/i);
});

test("caractere que não é dígito, conta nem operador é rejeitado", () => {
  assert.throws(() => analisarFormula("1 + a"), /inesperado/i);
});

test("validarFormula devolve null quando a sintaxe está ok", () => {
  assert.equal(validarFormula("(V[1] + V[2]) / 12"), null);
});

test("validarFormula devolve a mensagem quando a sintaxe está quebrada", () => {
  assert.match(validarFormula("(1 +"), /incompleta|fechar/i);
});

// A referência circular é responsabilidade de quem monta o `resolverConta`
// (dados/plano.js, que conhece filial+centro+mês) — aqui só confirma que o
// erro lançado pelo resolvedor atravessa `avaliarFormula` sem ser engolido.
test("erro de referência circular do resolvedor atravessa a avaliação", () => {
  const emResolucao = new Set();
  function resolver(codigo) {
    if (emResolucao.has(codigo)) throw new Error(`Referência circular envolvendo a conta ${codigo}.`);
    emResolucao.add(codigo);
    if (codigo === "a") return avaliarFormula("V[b]", resolver);
    if (codigo === "b") return avaliarFormula("V[a]", resolver);
    throw new Error(`Conta ${codigo} não encontrada.`);
  }
  assert.throws(() => resolver("a"), /circular/i);
});
