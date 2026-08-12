import assert from "node:assert/strict";
import test from "node:test";

import { MODULOS } from "../src/dados/modulos.js";
import {
  EDITA,
  NADA,
  VE,
  gerarConcessoes,
  lerTerritorio,
  proximoEstado,
} from "../src/dados/territorio.js";

const RECEITA = "receita-vendas";
const DEDUCOES = "deducoes-vendas";

test("sem concessão nenhuma, o território é tudo e a matriz é vazia", () => {
  const { cabe, territorio, matriz } = lerTerritorio([]);
  assert.equal(cabe, true);
  assert.deepEqual(territorio, [{ filial: null, centro: null }]);
  assert.equal(Object.values(matriz).every((estado) => estado === NADA), true);
});

test("um lugar e dois módulos viram uma linha de matriz cada", () => {
  const { cabe, territorio, matriz } = lerTerritorio([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
    { modulo: DEDUCOES, filial: "000001", centro: "020", podeEditar: false },
  ]);

  assert.equal(cabe, true);
  assert.deepEqual(territorio, [{ filial: "000001", centro: "020" }]);
  assert.equal(matriz[RECEITA], EDITA);
  assert.equal(matriz[DEDUCOES], VE);
  assert.equal(matriz["outras-despesas"], NADA);
});

test("concessão sem módulo vale para todos", () => {
  const { matriz } = lerTerritorio([
    { modulo: null, filial: "000025", centro: null, podeEditar: true },
  ]);
  assert.equal(
    MODULOS.every((modulo) => matriz[modulo.id] === EDITA),
    true
  );
});

test("vale a mais permissiva, como no resto do modelo", () => {
  const { matriz } = lerTerritorio([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: false },
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
  ]);
  assert.equal(matriz[RECEITA], EDITA);
});

// A recusa honesta: territórios diferentes por módulo são legítimos no modelo
// antigo, e salvar por cima com a matriz apagaria parte da permissão.
test("território diferente por módulo NÃO cabe na matriz", () => {
  const { cabe } = lerTerritorio([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
    { modulo: DEDUCOES, filial: "000001", centro: "001", podeEditar: true },
  ]);
  assert.equal(cabe, false);
});

test("mesmo módulo em dois lugares cabe: o território é os dois", () => {
  const { cabe, territorio } = lerTerritorio([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
    { modulo: RECEITA, filial: "000001", centro: "001", podeEditar: true },
  ]);
  assert.equal(cabe, true);
  assert.equal(territorio.length, 2);
});

test("gerar: um módulo em dois lugares dá duas concessões", () => {
  const concessoes = gerarConcessoes(
    [
      { filial: "000001", centro: "020" },
      { filial: "000001", centro: "001" },
    ],
    { [RECEITA]: EDITA }
  );
  assert.equal(concessoes.length, 2);
  assert.equal(concessoes.every((c) => c.modulo === RECEITA && c.podeEditar), true);
});

test("gerar: matriz toda no mesmo estado colapsa em módulo nulo", () => {
  const matriz = {};
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = VE;
  });

  const concessoes = gerarConcessoes([{ filial: null, centro: null }], matriz);
  assert.equal(concessoes.length, 1, "uma linha só, não oito");
  assert.equal(concessoes[0].modulo, null);
  assert.equal(concessoes[0].podeEditar, false);
});

test("gerar: matriz vazia não concede nada", () => {
  assert.deepEqual(gerarConcessoes([{ filial: "000001", centro: null }], {}), []);
});

// A garantia que sustenta trocar a tela: escrever pela matriz e ler de volta
// tem que devolver a mesma permissão.
test("ida e volta preserva a permissão", () => {
  const territorio = [
    { filial: "000001", centro: "020" },
    { filial: "000025", centro: "001" },
  ];
  const matriz = { [RECEITA]: EDITA, [DEDUCOES]: VE };

  const lido = lerTerritorio(gerarConcessoes(territorio, matriz));

  assert.equal(lido.cabe, true);
  assert.deepEqual(lido.territorio, territorio);
  assert.equal(lido.matriz[RECEITA], EDITA);
  assert.equal(lido.matriz[DEDUCOES], VE);
  assert.equal(lido.matriz["custos-variaveis"], NADA);
});

test("ida e volta também no caso de tudo liberado", () => {
  const matriz = {};
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = EDITA;
  });

  const lido = lerTerritorio(gerarConcessoes([{ filial: null, centro: null }], matriz));
  assert.equal(lido.cabe, true);
  assert.deepEqual(lido.territorio, [{ filial: null, centro: null }]);
  assert.equal(
    MODULOS.every((modulo) => lido.matriz[modulo.id] === EDITA),
    true
  );
});

test("o clique cicla nada, vê, edita e volta", () => {
  assert.equal(proximoEstado(NADA), VE);
  assert.equal(proximoEstado(VE), EDITA);
  assert.equal(proximoEstado(EDITA), NADA);
});
