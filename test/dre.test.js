import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ESTRUTURA_DRE, montarDre } from "../src/dados/dre.js";
import { MODULOS } from "../src/dados/modulos.js";
import { chavePlanejado, criarPlano } from "../src/dados/plano.js";
import { indexarContas } from "../src/dados/contas.js";
import { indexarRealizado } from "../src/dados/realizado.js";
import { SEM_CENTRO, criarVisao, definirContasDoCentro } from "../src/dados/visao.js";

// Todo módulo é orçado por centro: a lista da filial é a união deles, então o
// teste monta pelo centro e lê pela filial, como a tela faz.
const CENTRO = "002";

const ANO = 2025; // ano fechado: todos os meses têm realizado
const FILIAIS = [{ id: "000001", nome: "KING&JOE" }];

const RECEITA = "3.1.1.01.001";
const DEDUCAO = "3.1.2.01.001";
const CUSTO = "4.1.1.01.001";
const DESPESA_OP = "4.4.1.01.001";

const catalogo = indexarContas([
  { codigo: RECEITA, descricao: "COLEÇÃO", totalizaEm: null, sintetica: false, grupo: "R" },
  { codigo: DEDUCAO, descricao: "DEVOLUÇÃO", totalizaEm: null, sintetica: false, grupo: "DV" },
  { codigo: CUSTO, descricao: "CPV", totalizaEm: null, sintetica: false, grupo: "DV" },
  { codigo: DESPESA_OP, descricao: "ALUGUEL", totalizaEm: null, sintetica: false, grupo: "DF" },
]);

function visaoCompleta() {
  let visao = criarVisao("v1", "DRE", "25");
  visao = definirContasDoCentro(visao, "receita-vendas", "000001", CENTRO, [RECEITA]);
  visao = definirContasDoCentro(visao, "deducoes-vendas", "000001", CENTRO, [DEDUCAO]);
  visao = definirContasDoCentro(visao, "custos-variaveis", "000001", CENTRO, [CUSTO]);
  visao = definirContasDoCentro(visao, "despesas-operacionais", "000001", CENTRO, [DESPESA_OP]);
  return visao;
}

// Receita 1.000 em janeiro; dedução de 10% e custo de 40% sobre ela.
const planejado = {
  [chavePlanejado("receita-vendas", "000001", CENTRO, RECEITA, 1)]: 1000,
  [chavePlanejado("deducoes-vendas", "000001", CENTRO, DEDUCAO, 1, RECEITA)]: 10,
  [chavePlanejado("custos-variaveis", "000001", CENTRO, CUSTO, 1, RECEITA)]: 40,
  [chavePlanejado("despesas-operacionais", "000001", CENTRO, DESPESA_OP, 1)]: 150,
};

const realizado = indexarRealizado(
  [
    { classificacao: RECEITA, filial: "000001", centro: "001", mes: 1, debito: 0, credito: 2000 },
    { classificacao: DEDUCAO, filial: "000001", centro: "001", mes: 1, debito: 200, credito: 0 },
    { classificacao: CUSTO, filial: "000001", centro: "001", mes: 1, debito: 700, credito: 0 },
    { classificacao: DESPESA_OP, filial: "000001", centro: "001", mes: 1, debito: 300, credito: 0 },
  ],
  "25"
);

const anterior = indexarRealizado(
  [{ classificacao: RECEITA, filial: "000001", centro: "001", mes: 1, debito: 0, credito: 1500 }],
  "25"
);

const montar = (extra) =>
  montarDre({
    plano: { ...criarPlano("p1", "Oficial", ANO, "v1"), planejado },
    visao: visaoCompleta(),
    filiais: FILIAIS,
    catalogo,
    realizado,
    realizadoAnterior: anterior,
    ...extra,
  });

const linha = (lista, id) => lista.find((item) => item.id === id);

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

test("cada módulo aparece exatamente uma vez no DRE", () => {
  const usados = ESTRUTURA_DRE.filter((item) => item.modulo).map((item) => item.modulo);
  assert.equal(usados.length, new Set(usados).size, "módulo repetido");
  assert.deepEqual(
    [...usados].sort(),
    MODULOS.map((modulo) => modulo.id).sort(),
    "todo módulo tem que entrar no resultado"
  );
});

test("todo módulo entra com sinal declarado", () => {
  ESTRUTURA_DRE.filter((item) => item.modulo).forEach((item) => {
    assert.ok(item.sinal === 1 || item.sinal === -1, `${item.modulo} sem sinal`);
  });
});

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

test("subtotal é a soma acumulada das linhas acima", () => {
  const dre = montar();

  // Planejado: receita 1.000, dedução 10% = 100, custo 40% = 400.
  assert.equal(linha(dre, "receita-vendas").planejado, 1000);
  assert.equal(linha(dre, "deducoes-vendas").planejado, 100);
  assert.equal(linha(dre, "receita-liquida").planejado, 900);
  assert.equal(linha(dre, "custos-variaveis").planejado, 400);
  assert.equal(linha(dre, "margem-bruta").planejado, 500);
  assert.equal(linha(dre, "margem-contribuicao").planejado, 500); // sem despesa variável
  assert.equal(linha(dre, "despesas-operacionais").planejado, 150);
  assert.equal(linha(dre, "resultado-operacional").planejado, 350);
  assert.equal(linha(dre, "resultado-liquido").planejado, 350);
});

test("o realizado acumula com o mesmo sinal do planejado", () => {
  const dre = montar();

  assert.equal(linha(dre, "receita-vendas").realizado, 2000);
  assert.equal(linha(dre, "deducoes-vendas").realizado, 200);
  assert.equal(linha(dre, "receita-liquida").realizado, 1800);
  assert.equal(linha(dre, "margem-bruta").realizado, 1100); // 1.800 - 700
  assert.equal(linha(dre, "resultado-liquido").realizado, 800); // 1.100 - 300
});

test("ano anterior entra na coluna comparativa e na variação", () => {
  const dre = montar();
  const receita = linha(dre, "receita-vendas");

  assert.equal(receita.anterior, 1500);
  assert.equal(receita.variacao, 500);
  assert.equal(Math.round(receita.variacaoPercentual), 33);
});

test("participação é sobre a receita líquida, não a bruta", () => {
  const dre = montar();

  // Custo planejado 400 sobre receita líquida planejada 900.
  assert.equal(Math.round(linha(dre, "custos-variaveis").participacaoPlanejado * 100) / 100, 44.44);
  // Custo realizado 700 sobre receita líquida realizada 1.800.
  assert.equal(Math.round(linha(dre, "custos-variaveis").participacaoRealizado * 100) / 100, 38.89);
  assert.equal(linha(dre, "receita-liquida").participacaoRealizado, 100);
});

test("módulo sem contas na visão vem zerado e marcado", () => {
  const dre = montar();
  const semContas = linha(dre, "despesas-pessoal");

  assert.equal(semContas.configurado, false);
  assert.equal(semContas.planejado, 0);
  assert.equal(semContas.realizado, 0);
});

test("sem receita líquida a participação é zero, não infinito", () => {
  const dre = montarDre({
    plano: { ...criarPlano("p1", "Oficial", ANO, "v1"), planejado: {} },
    visao: criarVisao("v1", "DRE", "25"),
    filiais: FILIAIS,
    catalogo,
    realizado: indexarRealizado([], "25"),
    realizadoAnterior: indexarRealizado([], "25"),
  });

  dre.forEach((item) => {
    assert.equal(item.participacaoPlanejado, 0, item.id);
    assert.equal(item.participacaoRealizado, 0, item.id);
  });
});

test("filtrar por filial sem movimento zera o DRE", () => {
  const dre = montar({ filiais: [{ id: "000099", nome: "OUTRA" }] });
  assert.equal(linha(dre, "resultado-liquido").realizado, 0);
  assert.equal(linha(dre, "resultado-liquido").planejado, 0);
});
