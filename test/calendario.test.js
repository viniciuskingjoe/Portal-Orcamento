import { strict as assert } from "node:assert";
import { test } from "node:test";

import { mesTemRealizado, mesesComRealizado } from "../src/dados/calendario.js";

const HOJE = new Date(2026, 6, 29); // 29/07/2026

test("mês futuro do ano corrente não tem realizado", () => {
  assert.equal(mesTemRealizado(2026, 8, HOJE), false);
  assert.equal(mesTemRealizado(2026, 12, HOJE), false);
});

test("mês corrente e anteriores têm realizado", () => {
  assert.equal(mesTemRealizado(2026, 7, HOJE), true);
  assert.equal(mesTemRealizado(2026, 1, HOJE), true);
});

test("ano inteiro no passado tem realizado; ano futuro não tem", () => {
  assert.equal(mesTemRealizado(2025, 12, HOJE), true);
  assert.equal(mesTemRealizado(2027, 1, HOJE), false);
});

test("o corte acompanha o relógio, não uma data cravada", () => {
  // Regressão: o corte era `ano === 2026 && mes > 7` no código. Em 2027 o
  // sistema passaria a exibir realizado de meses que ainda nem aconteceram.
  const emJaneiro2027 = new Date(2027, 0, 15);
  assert.equal(mesTemRealizado(2026, 12, emJaneiro2027), true);
  assert.equal(mesTemRealizado(2027, 2, emJaneiro2027), false);
});

test("contagem de meses com dado", () => {
  assert.equal(mesesComRealizado(2026, HOJE), 7);
  assert.equal(mesesComRealizado(2025, HOJE), 12);
  assert.equal(mesesComRealizado(2027, HOJE), 0);
});
