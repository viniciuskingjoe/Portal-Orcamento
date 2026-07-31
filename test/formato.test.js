import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formatarParaEdicao, parseNumeroPtBr } from "../src/lib/formato.js";

test("vírgula é sempre o separador decimal", () => {
  assert.equal(parseNumeroPtBr("1.234,56"), 1234.56);
  assert.equal(parseNumeroPtBr("0,5"), 0.5);
  assert.equal(parseNumeroPtBr("1.850.000,00"), 1850000);
});

test("ponto em grupos de 3 é separador de milhar", () => {
  // Regressão: "1.850.000" era lido como 1,85 — erro de 1.000.000x.
  assert.equal(parseNumeroPtBr("1.850.000"), 1850000);
  assert.equal(parseNumeroPtBr("1.234"), 1234);
  assert.equal(parseNumeroPtBr("12.000"), 12000);
});

test("ponto fora do formato de milhar continua sendo decimal", () => {
  assert.equal(parseNumeroPtBr("1.5"), 1.5);
  assert.equal(parseNumeroPtBr("10.25"), 10.25);
  assert.equal(parseNumeroPtBr("1.2345"), 1.2345);
});

test("entradas vazias e inválidas viram zero", () => {
  assert.equal(parseNumeroPtBr(""), 0);
  assert.equal(parseNumeroPtBr(null), 0);
  assert.equal(parseNumeroPtBr(undefined), 0);
  assert.equal(parseNumeroPtBr("abc"), 0);
});

test("negativos e R$ são aceitos", () => {
  assert.equal(parseNumeroPtBr("-1.000,50"), -1000.5);
  assert.equal(parseNumeroPtBr("R$ 2.500,00"), 2500);
});

test("formatarParaEdicao não usa separador de milhar nem zeros inúteis", () => {
  assert.equal(formatarParaEdicao(1850000), "1850000");
  assert.equal(formatarParaEdicao(12.5), "12,5");
  assert.equal(formatarParaEdicao(0), "0");
  assert.equal(formatarParaEdicao(10.825), "10,825");
});

test("editar e confirmar preserva o valor exibido", () => {
  for (const valor of [0, 1850000, 12.5, 10.825, 999999.99]) {
    assert.equal(parseNumeroPtBr(formatarParaEdicao(valor)), valor);
  }
});

// Regressão: com três casas, 38,9595 virava 38,96 ao reabrir a célula e a
// confirmação seguinte gravava o valor arredondado. Numa base de 133 milhões
// isso é meio milhar de reais que aparece do nada.
test("percentual não perde casas ao reabrir a célula", () => {
  assert.equal(formatarParaEdicao(38.9595), "38,9595");
  assert.equal(parseNumeroPtBr(formatarParaEdicao(38.9595)), 38.9595);

  for (const taxa of [1.7, 38.9595, 0.0125, 2.505, 74.7125]) {
    assert.equal(parseNumeroPtBr(formatarParaEdicao(taxa)), taxa);
  }
});

// O toFixed existe para absorver o resíduo binário das somas; seis casas ainda
// fazem isso.
test("resíduo de ponto flutuante não vaza para o input", () => {
  assert.equal(formatarParaEdicao(0.1 + 0.2), "0,3");
  assert.equal(formatarParaEdicao(2257042.6400000002), "2257042,64");
});
