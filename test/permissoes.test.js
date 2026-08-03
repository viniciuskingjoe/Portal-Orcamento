import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  SESSAO_VAZIA,
  centrosPermitidos,
  ehAdmin,
  filiaisPermitidas,
  modulosPermitidos,
  podeEditar,
  podeLancar,
  podeVer,
  descreverConcessao,
  resumirAcessos,
  resumirEscopo,
} from "../src/dados/permissoes.js";
import { SEM_CENTRO } from "../src/dados/visao.js";

const FILIAIS = [
  { id: "000001", nome: "KING&JOE" },
  { id: "000025", nome: "MEN HUB" },
];
const CENTROS = [
  { id: "020", nome: "E-COMMERCE" },
  { id: "002", nome: "ADMINISTRAÇÃO" },
];
const MODULOS = [
  { id: "receita-vendas" },
  { id: "deducoes-vendas" },
  { id: "despesas-operacionais" },
];

const sessao = (acessos, admin = false) => ({ login: "joao", nome: "João", admin, acessos });

// Quem cuida do e-commerce: lança o centro 020 e enxerga a receita para ter a
// base do percentual.
const ecommerce = sessao([
  { modulo: null, filial: null, centro: "020", podeEditar: true },
  { modulo: "receita-vendas", filial: null, centro: null, podeEditar: false },
]);

// ---------------------------------------------------------------------------
// Admin e sessão vazia
// ---------------------------------------------------------------------------

test("admin passa por tudo", () => {
  const chefe = sessao([], true);
  assert.equal(ehAdmin(chefe), true);
  assert.equal(podeVer(chefe, { modulo: "x", filial: "y", centro: "z" }), true);
  assert.equal(podeEditar(chefe, { modulo: "x", filial: "y", centro: "z" }), true);
  assert.deepEqual(filiaisPermitidas(chefe, FILIAIS), FILIAIS);
});

test("sessão vazia não vê nada", () => {
  assert.equal(podeVer(SESSAO_VAZIA, { modulo: "receita-vendas" }), false);
  assert.equal(podeEditar(SESSAO_VAZIA, {}), false);
  assert.deepEqual(filiaisPermitidas(SESSAO_VAZIA, FILIAIS), []);
  assert.deepEqual(modulosPermitidos(SESSAO_VAZIA, MODULOS), []);
});

// ---------------------------------------------------------------------------
// Concessões
// ---------------------------------------------------------------------------

test("null na concessão vale por todos daquela dimensão", () => {
  const tudo = sessao([{ modulo: null, filial: null, centro: null, podeEditar: true }]);
  assert.equal(podeEditar(tudo, { modulo: "custos-variaveis", filial: "000025", centro: "002" }), true);
});

test("ver e editar são direitos distintos", () => {
  const diretor = sessao([{ modulo: null, filial: null, centro: null, podeEditar: false }]);
  assert.equal(podeVer(diretor, { modulo: "receita-vendas", filial: "000001" }), true);
  assert.equal(podeEditar(diretor, { modulo: "receita-vendas", filial: "000001" }), false);
});

test("concessão de um centro não alcança outro", () => {
  assert.equal(podeEditar(ecommerce, { modulo: "deducoes-vendas", filial: "000001", centro: "020" }), true);
  assert.equal(podeEditar(ecommerce, { modulo: "deducoes-vendas", filial: "000001", centro: "002" }), false);
  assert.equal(podeVer(ecommerce, { modulo: "deducoes-vendas", filial: "000001", centro: "002" }), false);
});

test("concessão de filial não alcança outra filial", () => {
  const menhub = sessao([{ modulo: null, filial: "000025", centro: null, podeEditar: true }]);
  assert.equal(podeEditar(menhub, { filial: "000025", centro: "020" }), true);
  assert.equal(podeEditar(menhub, { filial: "000001", centro: "020" }), false);
});

test("as linhas somam: vale a mais permissiva", () => {
  const misto = sessao([
    { modulo: null, filial: null, centro: null, podeEditar: false },
    { modulo: "custos-variaveis", filial: null, centro: "020", podeEditar: true },
  ]);
  assert.equal(podeVer(misto, { modulo: "outras-despesas", filial: "000001" }), true);
  assert.equal(podeEditar(misto, { modulo: "outras-despesas", filial: "000001" }), false);
  assert.equal(podeEditar(misto, { modulo: "custos-variaveis", filial: "000001", centro: "020" }), true);
});

// ---------------------------------------------------------------------------
// Módulo sem centro de custo
// ---------------------------------------------------------------------------

test("concessão presa a um centro não abre módulo sem centro", () => {
  // Receita de vendas não tem a dimensão; a tela consulta com SEM_CENTRO. Se
  // "centro 020" casasse aqui, quem cuida do e-commerce ganharia a receita da
  // empresa inteira sem ninguém ter concedido.
  const soCentro = sessao([{ modulo: null, filial: null, centro: "020", podeEditar: true }]);
  assert.equal(podeVer(soCentro, { modulo: "receita-vendas", filial: "000001", centro: SEM_CENTRO }), false);
});

test("a linha explícita é o que dá a receita como base do percentual", () => {
  assert.equal(podeVer(ecommerce, { modulo: "receita-vendas", filial: "000001", centro: SEM_CENTRO }), true);
  assert.equal(podeEditar(ecommerce, { modulo: "receita-vendas", filial: "000001", centro: SEM_CENTRO }), false);
});

// ---------------------------------------------------------------------------
// Perguntas amplas (dimensão não fixada)
// ---------------------------------------------------------------------------

test("perguntar sem fixar a dimensão aceita qualquer valor dela", () => {
  // "existe algum acesso que envolva a filial 000001?" — sem dizer o módulo nem
  // o centro. É como a lista de filiais é filtrada.
  assert.equal(podeVer(ecommerce, { filial: "000001" }), true);
  assert.deepEqual(filiaisPermitidas(ecommerce, FILIAIS), FILIAIS);
});

test("centros são recortados pelo que foi concedido no módulo", () => {
  assert.deepEqual(centrosPermitidos(ecommerce, CENTROS, { modulo: "deducoes-vendas" }), [
    { id: "020", nome: "E-COMMERCE" },
  ]);
});

test("filtrar centro sem dizer o módulo não devolve nada", () => {
  // Armadilha real: a concessão de "ver receita de vendas" não restringe centro,
  // então sem fixar o módulo ela liberaria a lista inteira de centros — inclusive
  // os de módulos que o usuário não pode tocar. A lista de centros só existe
  // dentro de um módulo, então exigir o módulo é o recorte seguro.
  assert.deepEqual(centrosPermitidos(ecommerce, CENTROS), []);
});

test("módulos são recortados pelo que foi concedido", () => {
  const soCustos = sessao([{ modulo: "custos-variaveis", filial: null, centro: null, podeEditar: true }]);
  assert.deepEqual(
    modulosPermitidos(soCustos, MODULOS).map((m) => m.id),
    []
  );
  assert.deepEqual(
    modulosPermitidos(ecommerce, MODULOS).map((m) => m.id),
    ["receita-vendas", "deducoes-vendas", "despesas-operacionais"]
  );
});

// ---------------------------------------------------------------------------
// Lançar
// ---------------------------------------------------------------------------

test("não se lança em Total nem sem centro em módulo que usa centro", () => {
  const tudo = sessao([{ modulo: null, filial: null, centro: null, podeEditar: true }]);

  assert.equal(podeLancar(tudo, { modulo: "x", filial: "total" }), false);
  assert.equal(podeLancar(tudo, { modulo: "x", filial: "000001", usaCentro: true, centro: SEM_CENTRO }), false);
  assert.equal(podeLancar(tudo, { modulo: "x", filial: "000001", usaCentro: true, centro: "002" }), true);
  assert.equal(podeLancar(tudo, { modulo: "x", filial: "000001", usaCentro: false }), true);
});

test("quem só vê não lança nem com tudo escolhido", () => {
  const diretor = sessao([{ modulo: null, filial: null, centro: null, podeEditar: false }]);
  assert.equal(podeLancar(diretor, { modulo: "x", filial: "000001", usaCentro: false }), false);
});

// ---------------------------------------------------------------------------
// Escopo em texto
// ---------------------------------------------------------------------------

test("escopo irrestrito não vira aviso na tela", () => {
  assert.equal(resumirEscopo(sessao([], true)), null);
  assert.equal(
    resumirEscopo(sessao([{ modulo: null, filial: null, centro: null, podeEditar: true }])),
    null
  );
});

test("escopo parcial vira o nome do que se está vendo", () => {
  assert.equal(resumirEscopo(ecommerce, { filiais: FILIAIS, centros: CENTROS }), "E-COMMERCE");

  const menhub = sessao([{ modulo: null, filial: "000025", centro: null, podeEditar: true }]);
  assert.equal(resumirEscopo(menhub, { filiais: FILIAIS, centros: CENTROS }), "MEN HUB");
});

test("sem acesso nenhum o escopo diz isso", () => {
  assert.equal(resumirEscopo(SESSAO_VAZIA), "sem acesso");
});

// ---------------------------------------------------------------------------
// Concessão em palavras
//
// "todos os módulos · todas as filiais · 020" é ilegível. A tela de
// administração precisa dizer o que a linha significa em uma frase.
// ---------------------------------------------------------------------------

const CATALOGOS = {
  modulos: [{ id: "receita-vendas", nome: "Receita de vendas" }],
  filiais: FILIAIS,
  centros: CENTROS,
};

test("concessão sem restrição nenhuma é 'tudo'", () => {
  assert.equal(descreverConcessao({ modulo: null, filial: null, centro: null }, CATALOGOS), "tudo");
});

test("só as dimensões restritas aparecem", () => {
  assert.equal(descreverConcessao({ modulo: null, filial: null, centro: "020" }, CATALOGOS), "E-COMMERCE");
  assert.equal(descreverConcessao({ modulo: null, filial: "000025", centro: null }, CATALOGOS), "MEN HUB");
  assert.equal(
    descreverConcessao({ modulo: "receita-vendas", filial: "000025", centro: null }, CATALOGOS),
    "Receita de vendas · MEN HUB"
  );
});

test("id sem nome no catálogo aparece como id, não some", () => {
  assert.equal(descreverConcessao({ modulo: null, filial: "000099", centro: null }, CATALOGOS), "000099");
});

test("o resumo separa o que edita do que só vê", () => {
  assert.equal(resumirAcessos(ecommerce, CATALOGOS), "edita E-COMMERCE · vê Receita de vendas");
});

test("admin não tem resumo de concessão: passa por cima delas", () => {
  assert.equal(resumirAcessos({ admin: true, acessos: [] }, CATALOGOS), "vê e edita tudo");
  assert.equal(
    resumirAcessos({ admin: true, acessos: [{ modulo: null, filial: null, centro: "020" }] }, CATALOGOS),
    "vê e edita tudo"
  );
});

test("sem concessão nenhuma o resumo diz isso", () => {
  // Entra no portal e não vê nada — é um estado que precisa gritar na tela.
  assert.equal(resumirAcessos({ admin: false, acessos: [] }, CATALOGOS), "sem acesso a nada");
});
