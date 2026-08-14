import assert from "node:assert/strict";
import test from "node:test";

import { filtrarPorPrefixos, indexarContas } from "../src/dados/contas.js";
import { MODULOS, MODULOS_DE_VALOR, ehQuantidade, modulo } from "../src/dados/modulos.js";
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

// --------------------------------------------------------------------------
// Recorte da árvore de contas
//
// O grupo contábil DF pega de 4.1 a 4.7 — toda a despesa fixa. Folha são três
// famílias dentro disso, e é o que o Scoreplan mostra na tela de pessoal.
// --------------------------------------------------------------------------

const CATALOGO = indexarContas([
  { codigo: "4.2", descricao: "LUCRO BRUTO OPERACIONAL", sintetica: true, grupo: "DF" },
  { codigo: "4.2.1", descricao: "CUSTOS DIRETOS", sintetica: true, grupo: "DF" },
  { codigo: "4.2.1.10", descricao: "MÃO DE OBRA DIRETA", sintetica: true, grupo: "DF" },
  { codigo: "4.2.1.10.001", descricao: "13º SALARIO", sintetica: false, grupo: "DF" },
  { codigo: "4.2.1.20", descricao: "OUTRO CUSTO", sintetica: true, grupo: "DF" },
  { codigo: "4.2.1.20.001", descricao: "ENERGIA", sintetica: false, grupo: "DF" },
  { codigo: "4.5", descricao: "DESPESAS FINANCEIRAS", sintetica: true, grupo: "DF" },
  { codigo: "4.5.1", descricao: "JUROS", sintetica: false, grupo: "DF" },
]);

test("os prefixos do módulo de pessoal são as três famílias de folha", () => {
  assert.deepEqual(modulo("despesas-pessoal").prefixos, ["4.2.1.10", "4.3.1.01", "4.4.1.01"]);
});

test("sem prefixos, a árvore passa inteira", () => {
  assert.equal(filtrarPorPrefixos(CATALOGO, undefined).lista.length, CATALOGO.lista.length);
});

test("o recorte deixa só o ramo pedido", () => {
  const recortado = filtrarPorPrefixos(CATALOGO, ["4.2.1.10"]);
  assert.deepEqual(
    recortado.lista.map((item) => item.codigo),
    ["4.2", "4.2.1", "4.2.1.10", "4.2.1.10.001"]
  );
});

// Sem os pais, 421.10 apareceria solto e ninguém saberia de onde ele vem.
test("os pais vêm junto, mas não selecionáveis", () => {
  const recortado = filtrarPorPrefixos(CATALOGO, ["4.2.1.10"]);
  const porCodigo = new Map(recortado.lista.map((item) => [item.codigo, item]));
  assert.equal(porCodigo.get("4.2").selecionavel, false);
  assert.equal(porCodigo.get("4.2.1").selecionavel, false);
  assert.notEqual(porCodigo.get("4.2.1.10").selecionavel, false);
});

// O prefixo casa por segmento: "4.2.1.1" não pode arrastar "4.2.1.10".
test("o prefixo não pega irmão de nome parecido", () => {
  const recortado = filtrarPorPrefixos(CATALOGO, ["4.2.1.1"]);
  assert.equal(
    recortado.lista.some((item) => item.codigo === "4.2.1.10"),
    false
  );
});

test("módulo sem prefixos enxerga o grupo inteiro", () => {
  assert.equal(modulo("despesas-operacionais").prefixos, undefined);
});
