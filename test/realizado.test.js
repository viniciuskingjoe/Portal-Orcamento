import { strict as assert } from "node:assert";
import { test } from "node:test";

import { indexarContas } from "../src/dados/contas.js";
import { indexarRealizado, somarRealizado } from "../src/dados/realizado.js";

const catalogo = indexarContas([
  { codigo: "3.1.1.1", descricao: "VENDA DE MERCADORIA", totalizaEm: null, sintetica: true },
  { codigo: "3.1.1.1.01", descricao: "BAZAR", totalizaEm: "3.1.1.1", sintetica: false },
  { codigo: "3.1.1.1.02", descricao: "COLEÇÃO", totalizaEm: "3.1.1.1", sintetica: false },
  { codigo: "4.1", descricao: "CUSTOS", totalizaEm: null, sintetica: true },
  { codigo: "4.1.01", descricao: "MATÉRIA-PRIMA", totalizaEm: "4.1", sintetica: false },
]);

const FILIAIS = [{ id: "000001" }, { id: "000008" }];

const indice = indexarRealizado([
  { classificacao: "3.1.1.1.01", filial: "000001", mes: 1, debito: 0, credito: 1000 },
  { classificacao: "3.1.1.1.02", filial: "000001", mes: 1, debito: 100, credito: 5000 },
  { classificacao: "3.1.1.1.02", filial: "000008", mes: 1, debito: 0, credito: 250 },
  { classificacao: "3.1.1.1.02", filial: "000001", mes: 2, debito: 0, credito: 7000 },
  { classificacao: "4.1.01", filial: "000001", mes: 1, debito: 3000, credito: 200 },
]);

const somar = (extra) =>
  somarRealizado({
    indice,
    catalogo,
    classificacoes: ["3.1.1.1.02"],
    filiais: FILIAIS,
    mes: 1,
    tipo: "receita",
    ...extra,
  });

test("receita é crédito menos débito", () => {
  // 000001: 5000 − 100 = 4900 · 000008: 250 − 0 = 250
  assert.equal(somar(), 5150);
});

test("despesa inverte o sinal", () => {
  // Planejado é sempre positivo; devolver a despesa positiva deixa a variação
  // significar a mesma coisa nos dois tipos de módulo.
  assert.equal(
    somar({ classificacoes: ["4.1.01"], tipo: "despesa" }),
    2800 // 3000 − 200
  );
  assert.equal(somar({ classificacoes: ["4.1.01"], tipo: "receita" }), -2800);
});

test("filial específica soma só ela", () => {
  assert.equal(somar({ filiais: [{ id: "000008" }] }), 250);
  assert.equal(somar({ filiais: [{ id: "000001" }] }), 4900);
});

test("mês sem movimento é zero, não erro", () => {
  assert.equal(somar({ mes: 7 }), 0);
});

test("soma só o que está marcado, sem expandir descendentes", () => {
  // A marcação é em cascata na tela: quando o usuário marca "3.1.1.1", as folhas
  // vão marcadas também. Expandir aqui, além de redundante, faria desmarcar uma
  // folha isolada não surtir efeito no total.
  assert.equal(somar({ classificacoes: ["3.1.1.1"] }), 0, "sintética não tem lançamento próprio");
  assert.equal(somar({ classificacoes: ["3.1.1.1", "3.1.1.1.01", "3.1.1.1.02"] }), 1000 + 5150);
});

test("desmarcar uma folha tira o valor dela do total", () => {
  // É o ponto do modelo em cascata.
  const todas = ["3.1.1.1", "3.1.1.1.01", "3.1.1.1.02"];
  const semBazar = todas.filter((c) => c !== "3.1.1.1.01");
  assert.equal(somar({ classificacoes: semBazar }), 5150);
});

test("código repetido na lista não conta duas vezes", () => {
  assert.equal(somar({ classificacoes: ["3.1.1.1.02", "3.1.1.1.02"] }), 5150);
});

test("sem classificação selecionada o total é zero", () => {
  assert.equal(somar({ classificacoes: [] }), 0);
});

test("sem filial o total é zero", () => {
  assert.equal(somar({ filiais: [] }), 0);
});

test("índice vazio devolve zero", () => {
  assert.equal(somar({ indice: indexarRealizado([]) }), 0);
  assert.equal(somar({ indice: indexarRealizado(undefined) }), 0);
});

test("linhas repetidas da mesma chave são acumuladas", () => {
  // A consulta agrupa, mas o índice não pode depender disso.
  const duplicado = indexarRealizado([
    { classificacao: "3.1.1.1.02", filial: "000001", mes: 1, debito: 0, credito: 100 },
    { classificacao: "3.1.1.1.02", filial: "000001", mes: 1, debito: 0, credito: 400 },
  ]);
  assert.equal(somar({ indice: duplicado }), 500);
});

test("valor em texto (numeric do driver) é somado como número", () => {
  const comTexto = indexarRealizado([
    { classificacao: "3.1.1.1.02", filial: "000001", mes: 1, debito: "100", credito: "5000" },
  ]);
  assert.equal(somar({ indice: comTexto }), 4900);
});
