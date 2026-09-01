import test from "node:test";
import assert from "node:assert/strict";

import {
  filtrarEstadoPorSessao,
  filtrarGruposPorSessao,
  filtrarRealizadoPorSessao,
} from "../server/escopo.js";

const sessao = {
  login: "ana",
  admin: false,
  acessos: [{ modulo: "receita-vendas", filial: "F1", centro: "C1", podeEditar: false }],
};

function estado() {
  return {
    configuracao: { filiaisAtivas: ["F1", "F2"] },
    visoes: [
      {
        id: "v1",
        dreLinhas: [
          {
            id: "receita",
            origem: "modulo",
            moduloId: "receita-vendas",
            valores: [{ codigo: "3.1" }, { codigo: "3.2" }],
          },
          { id: "despesa", origem: "modulo", moduloId: "outras-despesas", valores: [] },
          { id: "resultado", origem: "formula", formula: "receita-despesa" },
        ],
        modulos: {
          "receita-vendas": {
            sinais: { "3.1": "receita", "3.2": "receita" },
            formulas: { "3.1": { expressao: "FIXO" }, "3.2": { expressao: "FIXO" } },
            filiais: {
              F1: {
                contas: ["3.1", "3.2"],
                centros: { C1: ["3.1"], C2: ["3.2"] },
              },
              F2: { contas: ["3.1"], centros: { C1: ["3.1"] } },
            },
          },
          "outras-despesas": { sinais: {}, formulas: {}, filiais: {} },
        },
      },
    ],
    planos: [
      {
        id: "p1",
        visaoId: "v1",
        planejado: {
          "receita-vendas|F1|C1|3.1|1|": 10,
          "receita-vendas|F1|C2|3.2|1|": 20,
          "receita-vendas|F2|C1|3.1|1|": 30,
          "outras-despesas|F1|C1|4.1|1|": 40,
        },
        funcionarios: { "F1|C1|1": 2, "F1|C2|1": 3 },
      },
    ],
  };
}

test("estado sai recortado por módulo, filial, centro e conta", () => {
  const filtrado = filtrarEstadoPorSessao(estado(), sessao);
  const visao = filtrado.visoes[0];

  assert.deepEqual(filtrado.configuracao.filiaisAtivas, ["F1"]);
  assert.deepEqual(Object.keys(visao.modulos), ["receita-vendas"]);
  assert.deepEqual(Object.keys(visao.modulos["receita-vendas"].filiais), ["F1"]);
  assert.deepEqual(visao.modulos["receita-vendas"].filiais.F1.centros, { C1: ["3.1"] });
  assert.deepEqual(visao.modulos["receita-vendas"].filiais.F1.contas, ["3.1"]);
  assert.deepEqual(Object.keys(visao.modulos["receita-vendas"].sinais), ["3.1"]);
  assert.deepEqual(visao.dreLinhas.map((linha) => linha.id), ["receita", "resultado"]);
  assert.deepEqual(visao.dreLinhas[0].valores, [{ codigo: "3.1" }]);
  assert.deepEqual(filtrado.planos[0].planejado, {
    "receita-vendas|F1|C1|3.1|1|": 10,
  });
  assert.deepEqual(filtrado.planos[0].funcionarios, {});
});

test("administrador recebe o estado integral sem cópia desnecessária", () => {
  const completo = estado();
  assert.equal(filtrarEstadoPorSessao(completo, { admin: true }), completo);
});

test("realizado só atravessa se a classificação estiver vinculada a um escopo visível", () => {
  const linhas = [
    { classificacao: "3.1", filial: "F1", centro: "C1", debito: 0, credito: 10 },
    { classificacao: "3.2", filial: "F1", centro: "C2", debito: 0, credito: 20 },
  ];
  const vinculos = [
    { modulo: "receita-vendas", classificacao: "3.1", filial: "F1", centro: "C1" },
    { modulo: "receita-vendas", classificacao: "3.2", filial: "F1", centro: "C2" },
  ];

  assert.deepEqual(filtrarRealizadoPorSessao(linhas, vinculos, sessao), [linhas[0]]);
});

test("grupos escondem centros que não pertencem a nenhuma concessão", () => {
  assert.deepEqual(
    filtrarGruposPorSessao(
      [
        { id: "g", centros: ["C1", "C2"] },
        { id: "oculto", centros: ["C2"] },
      ],
      sessao
    ),
    [{ id: "g", centros: ["C1"] }]
  );
});
