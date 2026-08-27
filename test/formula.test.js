import assert from "node:assert/strict";
import test from "node:test";

import {
  analisarFormula,
  avaliarFormula,
  referenciasDaFormula,
  validarFormula,
} from "../src/dados/formula.js";

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

// ---------------------------------------------------------------------------
// L[linha] — mesma gramática, usada pelo DRE para referenciar outras linhas
// do demonstrativo em vez de contas do plano de contas.
// ---------------------------------------------------------------------------

test("L[] funciona igual V[], só que é outro prefixo", () => {
  const valor = avaliarFormula("L[311] - L[312]", (codigo) =>
    resolverDe({ 311: 1000, 312: 100 })(codigo)
  );
  assert.equal(valor, 900);
});

test("o resolvedor recebe o prefixo como segundo argumento", () => {
  const vistos = [];
  avaliarFormula("V[a] + L[b]", (codigo, prefixo) => {
    vistos.push(`${prefixo}[${codigo}]`);
    return 1;
  });
  assert.deepEqual(vistos, ["V[a]", "L[b]"]);
});

test("resolvedor que ignora o prefixo (assinatura antiga) continua funcionando", () => {
  // Despesas com pessoal só passa `(codigo) => ...` — sem o segundo
  // argumento. JS não reclama de argumento a mais não declarado.
  const resolverAntigo = (codigo) => resolverDe({ "4.2.1.10.001": 500 })(codigo);
  assert.equal(avaliarFormula("V[4.2.1.10.001] / 2", resolverAntigo), 250);
});

test("V[] e L[] misturados na mesma expressão", () => {
  const valor = avaliarFormula("V[conta1] + L[linha1]", (codigo, prefixo) =>
    prefixo === "V" ? 100 : 50
  );
  assert.equal(valor, 150);
});

test("prefixo desconhecido (ex.: X[algo]) é rejeitado como caractere inesperado", () => {
  assert.throws(() => analisarFormula("X[1]"), /inesperado/i);
});

test("colchete vazio reclama do prefixo certo (L[], não sempre V[])", () => {
  assert.throws(() => analisarFormula("L[]"), /L\[\]/);
});

test("referenciasDaFormula lista cada L[]/V[] na ordem em que aparece", () => {
  assert.deepEqual(referenciasDaFormula("L[a] + V[b] - L[c]"), [
    { prefixo: "L", codigo: "a" },
    { prefixo: "V", codigo: "b" },
    { prefixo: "L", codigo: "c" },
  ]);
});

test("referenciasDaFormula acha referência dentro de parênteses e negativo", () => {
  assert.deepEqual(referenciasDaFormula("-(L[a] + L[b]) / 2"), [
    { prefixo: "L", codigo: "a" },
    { prefixo: "L", codigo: "b" },
  ]);
});

test("referenciasDaFormula em número puro devolve lista vazia", () => {
  assert.deepEqual(referenciasDaFormula("100"), []);
});
