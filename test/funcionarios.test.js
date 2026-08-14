import assert from "node:assert/strict";
import test from "node:test";

import { MODULOS, MODULOS_DE_VALOR, ehQuantidade } from "../src/dados/modulos.js";
import { chaveFuncionario, chavePlanejado, criarPlano } from "../src/dados/plano.js";
import { funcionarioDaChave } from "../src/lib/estado.js";

test("só Despesas com pessoal guarda quantidade", () => {
  const deQuantidade = MODULOS.filter((modulo) => ehQuantidade(modulo.id));
  assert.deepEqual(
    deQuantidade.map((modulo) => modulo.id),
    ["despesas-pessoal"]
  );
});

// O que sustenta não somar gente com reais em nenhuma consolidação.
test("os módulos de valor excluem o de quantidade", () => {
  assert.equal(MODULOS_DE_VALOR.length, MODULOS.length - 1);
  assert.equal(
    MODULOS_DE_VALOR.some((modulo) => modulo.id === "despesas-pessoal"),
    false
  );
});

test("a chave da quantidade tem três campos, sem módulo nem conta", () => {
  assert.equal(chaveFuncionario("000001", "007", 3), "000001|007|3");
});

test("centro nulo vira vazio, como no planejado", () => {
  assert.equal(chaveFuncionario("000001", null, 12), "000001||12");
});

// Se as duas chaves pudessem coincidir, um mapa leria o valor do outro.
test("a chave da quantidade nunca colide com a do planejado", () => {
  const doPlanejado = chavePlanejado("despesas-pessoal", "000001", "007", "4.4.1.01.001", 3);
  assert.notEqual(chaveFuncionario("000001", "007", 3), doPlanejado);
});

test("ida e volta da chave preserva os campos", () => {
  const celula = funcionarioDaChave(chaveFuncionario("000025", "020", 7), 13);
  assert.deepEqual(celula, { filial: "000025", centro: "020", mes: 7, quantidade: 13 });
});

test("quantidade nula atravessa — é o que apaga a célula", () => {
  const celula = funcionarioDaChave(chaveFuncionario("000001", "007", 1), null);
  assert.equal(celula.quantidade, null);
});

test("plano novo nasce com os dois mapas separados", () => {
  const plano = criarPlano("p1", "2026", 2026, "v1");
  assert.deepEqual(plano.planejado, {});
  assert.deepEqual(plano.funcionarios, {});
});
