import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formatarParaEdicao, formatarPercentual, parseNumeroPtBr } from "../src/lib/formato.js";

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

// O Scoreplan TRUNCA percentual em duas casas. Arredondando, 110,4361% virava
// 110,44 contra 110,43 do relatório — um centésimo em três meses de doze é o
// bastante para alguém desconfiar do resto da tabela.
test("percentual é truncado, não arredondado", () => {
  assert.equal(formatarPercentual(110.4361), "110,43%");
  assert.equal(formatarPercentual(12.2996), "12,29%");
  assert.equal(formatarPercentual(30.158), "30,15%");
  assert.equal(formatarPercentual(-53.6394), "-53,63%");
});

test("truncar não muda quem já tem duas casas", () => {
  assert.equal(formatarPercentual(762.72), "762,72%");
  assert.equal(formatarPercentual(-100), "-100,00%");
  assert.equal(formatarPercentual(0), "0,00%");
});

// Truncar é só para EXIBIR. O que a pessoa edita mantém as seis casas, senão a
// taxa gravada seria destruída ao reabrir a célula.
test("truncar na exibição não afeta a edição", () => {
  assert.equal(formatarParaEdicao(38.959531), "38,959531");
});
