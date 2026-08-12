import assert from "node:assert/strict";
import test from "node:test";

import { MODULOS } from "../src/dados/modulos.js";
import {
  EDITA,
  NADA,
  VE,
  descreverAreas,
  gerarConcessoes,
  lerAreas,
  matrizVazia,
} from "../src/dados/territorio.js";

const RECEITA = "receita-vendas";
const DEDUCOES = "deducoes-vendas";

const matrizDe = (pares) => ({ ...matrizVazia(), ...pares });

test("sem concessão nenhuma, não há área", () => {
  assert.deepEqual(lerAreas([]), []);
});

test("um lugar e dois módulos viram uma área", () => {
  const areas = lerAreas([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
    { modulo: DEDUCOES, filial: "000001", centro: "020", podeEditar: false },
  ]);

  assert.equal(areas.length, 1);
  assert.deepEqual(areas[0].territorio, [{ filial: "000001", centro: "020" }]);
  assert.equal(areas[0].matriz[RECEITA], EDITA);
  assert.equal(areas[0].matriz[DEDUCOES], VE);
  assert.equal(areas[0].matriz["outras-despesas"], NADA);
});

test("concessão sem módulo vale para todos", () => {
  const [area] = lerAreas([{ modulo: null, filial: "000025", centro: null, podeEditar: true }]);
  assert.equal(
    MODULOS.every((modulo) => area.matriz[modulo.id] === EDITA),
    true
  );
});

test("vale a mais permissiva dentro do mesmo lugar", () => {
  const [area] = lerAreas([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: false },
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
  ]);
  assert.equal(area.matriz[RECEITA], EDITA);
});

// O caso que motivou as áreas: poder diferente por filial.
test("edita numa filial e só vê na outra dá DUAS áreas", () => {
  const areas = lerAreas([
    { modulo: null, filial: "000001", centro: null, podeEditar: true },
    { modulo: null, filial: "000025", centro: null, podeEditar: false },
  ]);

  assert.equal(areas.length, 2);
  const editando = areas.find((a) => a.matriz[RECEITA] === EDITA);
  const olhando = areas.find((a) => a.matriz[RECEITA] === VE);
  assert.deepEqual(editando.territorio, [{ filial: "000001", centro: null }]);
  assert.deepEqual(olhando.territorio, [{ filial: "000025", centro: null }]);
});

test("lugares com a mesma matriz se juntam numa área só", () => {
  const areas = lerAreas([
    { modulo: RECEITA, filial: "000001", centro: null, podeEditar: false },
    { modulo: RECEITA, filial: "000025", centro: null, podeEditar: false },
    { modulo: RECEITA, filial: "000011", centro: null, podeEditar: false },
  ]);
  assert.equal(areas.length, 1, "três filiais, um jeito de agir");
  assert.equal(areas[0].territorio.length, 3);
});

test("gerar: um módulo em dois lugares dá duas concessões", () => {
  const concessoes = gerarConcessoes([
    {
      territorio: [
        { filial: "000001", centro: "020" },
        { filial: "000001", centro: "001" },
      ],
      matriz: matrizDe({ [RECEITA]: EDITA }),
    },
  ]);
  assert.equal(concessoes.length, 2);
  assert.equal(concessoes.every((c) => c.modulo === RECEITA && c.podeEditar), true);
});

test("gerar: matriz toda no mesmo estado colapsa em módulo nulo", () => {
  const matriz = matrizVazia();
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = VE;
  });

  const concessoes = gerarConcessoes([{ territorio: [{ filial: null, centro: null }], matriz }]);
  assert.equal(concessoes.length, 1, "uma linha só, não oito");
  assert.equal(concessoes[0].modulo, null);
  assert.equal(concessoes[0].podeEditar, false);
});

test("gerar: área sem módulo marcado não concede nada", () => {
  assert.deepEqual(
    gerarConcessoes([{ territorio: [{ filial: "000001", centro: null }], matriz: matrizVazia() }]),
    []
  );
});

// Áreas sobrepostas colidiriam na chave (login, módulo, filial, centro).
test("gerar: no mesmo lugar, a mais permissiva prevalece", () => {
  const concessoes = gerarConcessoes([
    { territorio: [{ filial: "000001", centro: null }], matriz: matrizDe({ [RECEITA]: EDITA }) },
    { territorio: [{ filial: "000001", centro: null }], matriz: matrizDe({ [RECEITA]: VE }) },
  ]);
  assert.equal(concessoes.length, 1);
  assert.equal(concessoes[0].podeEditar, true);
});

// A garantia que sustenta trocar a tela.
test("ida e volta preserva a permissão", () => {
  const areas = [
    {
      territorio: [{ filial: "000001", centro: null }],
      matriz: matrizDe({ [RECEITA]: EDITA, [DEDUCOES]: EDITA }),
    },
    { territorio: [{ filial: "000025", centro: null }], matriz: matrizDe({ [RECEITA]: VE }) },
  ];

  const lido = lerAreas(gerarConcessoes(areas));

  assert.equal(lido.length, 2);
  const naMatriz = lido.find((a) => a.territorio[0].filial === "000001");
  const noHub = lido.find((a) => a.territorio[0].filial === "000025");
  assert.equal(naMatriz.matriz[RECEITA], EDITA);
  assert.equal(naMatriz.matriz[DEDUCOES], EDITA);
  assert.equal(noHub.matriz[RECEITA], VE);
  assert.equal(noHub.matriz[DEDUCOES], NADA);
});

test("ida e volta também com tudo liberado", () => {
  const matriz = matrizVazia();
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = EDITA;
  });

  const lido = lerAreas(gerarConcessoes([{ territorio: [{ filial: null, centro: null }], matriz }]));
  assert.equal(lido.length, 1);
  assert.deepEqual(lido[0].territorio, [{ filial: null, centro: null }]);
  assert.equal(
    MODULOS.every((modulo) => lido[0].matriz[modulo.id] === EDITA),
    true
  );
});

// A prévia da tela: "Vai gravar 9 concessões" descreve o banco, não a pessoa.
const CATALOGOS = {
  filiais: [
    { id: "000001", nome: "KING&JOE" },
    { id: "000025", nome: "MEN HUB" },
  ],
  centros: [{ id: "020", nome: "E-COMMERCE" }],
};

test("descreve cada área numa frase", () => {
  const frases = descreverAreas(
    [
      {
        territorio: [{ filial: "000001", centro: null }],
        matriz: matrizDe({ [RECEITA]: EDITA, [DEDUCOES]: VE }),
      },
      { territorio: [{ filial: "000025", centro: null }], matriz: matrizDe({ [RECEITA]: VE }) },
    ],
    CATALOGOS
  );

  assert.equal(frases.length, 2);
  assert.match(frases[0], /^Em KING&JOE: lança em Receita de vendas; só consulta Deduções/);
  assert.match(frases[1], /^Em MEN HUB: só consulta Receita de vendas\.$/);
});

test("todos os módulos no mesmo estado vira 'tudo'", () => {
  const matriz = matrizVazia();
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = EDITA;
  });
  const [frase] = descreverAreas([{ territorio: [{ filial: null, centro: null }], matriz }], CATALOGOS);
  assert.equal(frase, "Em tudo: lança em tudo.");
});

test("filial e centro juntos aparecem na mesma frase", () => {
  const [frase] = descreverAreas(
    [{ territorio: [{ filial: "000001", centro: "020" }], matriz: matrizDe({ [RECEITA]: VE }) }],
    CATALOGOS
  );
  assert.match(frase, /^Em KING&JOE · E-COMMERCE:/);
});

test("área sem módulo marcado não vira frase", () => {
  assert.deepEqual(descreverAreas([{ territorio: [], matriz: matrizVazia() }], CATALOGOS), []);
});
