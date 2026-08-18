import { strict as assert } from "node:assert";
import { test } from "node:test";

import { TOTAL_MODULO_TOKEN, calcularDre, mesesDoPeriodo } from "../src/dados/dre.js";
import { chavePlanejado, criarPlano } from "../src/dados/plano.js";
import { indexarContas } from "../src/dados/contas.js";
import { indexarRealizado } from "../src/dados/realizado.js";
import { criarVisao, definirContasDoCentro } from "../src/dados/visao.js";

// Todo módulo é orçado por centro: monta pelo centro, lê pela filial.
const CENTRO = "002";
const OUTRO_CENTRO = "009";
const ANO = 2025; // ano fechado: todos os meses têm realizado
const FILIAIS = [{ id: "000001", nome: "KING&JOE" }];

const RECEITA = "3.1.1.01.001";
// Segunda conta do MESMO módulo que RECEITA — só existe pra testar sinal por
// conta dentro da mesma linha, que precisa de duas contas de um módulo só
// (misturar módulos na mesma linha não é o caso que o recurso cobre).
const RECEITA2 = "3.1.1.01.002";
const DEDUCAO = "3.1.2.01.001";
const DESPESA_OP = "4.4.1.01.001";

const catalogo = indexarContas([
  { codigo: RECEITA, descricao: "COLEÇÃO", sintetica: false, grupo: "R" },
  { codigo: RECEITA2, descricao: "SALDO", sintetica: false, grupo: "R" },
  { codigo: DEDUCAO, descricao: "DEVOLUÇÃO", sintetica: false, grupo: "DV" },
  { codigo: DESPESA_OP, descricao: "ALUGUEL", sintetica: false, grupo: "DF" },
]);

function visaoBase() {
  let visao = criarVisao("v1", "DRE", "25");
  visao = definirContasDoCentro(visao, "receita-vendas", "000001", CENTRO, [RECEITA, RECEITA2]);
  visao = definirContasDoCentro(visao, "deducoes-vendas", "000001", CENTRO, [DEDUCAO]);
  visao = definirContasDoCentro(visao, "despesas-operacionais", "000001", CENTRO, [DESPESA_OP]);
  return visao;
}

function comLinhas(visao, linhas) {
  return { ...visao, dreLinhas: linhas };
}

const planejado = {
  [chavePlanejado("receita-vendas", "000001", CENTRO, RECEITA, 1)]: 1000,
  [chavePlanejado("receita-vendas", "000001", CENTRO, RECEITA2, 1)]: 300,
  [chavePlanejado("deducoes-vendas", "000001", CENTRO, DEDUCAO, 1)]: 100,
  [chavePlanejado("despesas-operacionais", "000001", CENTRO, DESPESA_OP, 1)]: 150,
};

const plano = () => ({ ...criarPlano("p1", "Oficial", ANO, "v1"), planejado });

const realizado = indexarRealizado(
  [
    { classificacao: RECEITA, filial: "000001", centro: CENTRO, mes: 1, debito: 0, credito: 2000 },
    { classificacao: RECEITA2, filial: "000001", centro: CENTRO, mes: 1, debito: 0, credito: 600 },
    { classificacao: DEDUCAO, filial: "000001", centro: CENTRO, mes: 1, debito: 200, credito: 0 },
    { classificacao: DESPESA_OP, filial: "000001", centro: CENTRO, mes: 1, debito: 300, credito: 0 },
  ],
  "25"
);

const anterior = indexarRealizado(
  [{ classificacao: RECEITA, filial: "000001", centro: CENTRO, mes: 1, debito: 0, credito: 1500 }],
  "25"
);

const linha = (lista, id) => lista.find((item) => item.id === id);

// ---------------------------------------------------------------------------
// Linha "origem: modulo"
// ---------------------------------------------------------------------------

test("linha modulo soma as contas explícitas escolhidas na configuração", () => {
  const visao = comLinhas(visaoBase(), [
    {
      id: "receita",
      ordem: 1,
      titulo: "Receita",
      origem: "modulo",
      moduloId: "receita-vendas",
      valores: [{ codigo: RECEITA, sinal: 1 }],
      mostra: true,
    },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "receita").total.planejado, 1000);
});

test("linha modulo sem contas escolhidas cai no módulo inteiro (compatibilidade)", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "op", ordem: 1, titulo: "Operacionais", origem: "modulo", moduloId: "despesas-operacionais", valores: [], sinal: -1, mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  // Sinal -1: despesa entra negativa.
  assert.equal(linha(linhas, "op").total.planejado, -150);
});

test("sinal negativo subtrai, positivo soma", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
    { id: "deducao", ordem: 2, titulo: "Dedução", origem: "modulo", moduloId: "deducoes-vendas", valores: [{ codigo: DEDUCAO, sinal: -1 }], mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "receita").total.planejado, 1000);
  assert.equal(linha(linhas, "deducao").total.planejado, -100);
});

test("linha com mais de uma conta ganha detalhe (drill-down), uma entrada por conta", () => {
  const visao = comLinhas(visaoBase(), [
    {
      id: "receita-total",
      ordem: 1,
      titulo: "Receita",
      origem: "modulo",
      moduloId: "receita-vendas",
      valores: [
        { codigo: RECEITA, sinal: 1 },
        { codigo: RECEITA2, sinal: -1 },
      ],
      mostra: true,
    },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  const receita = linha(linhas, "receita-total");

  assert.equal(receita.detalhe.length, 2);
  const doRECEITA = receita.detalhe.find((item) => item.codigo === RECEITA);
  const doRECEITA2 = receita.detalhe.find((item) => item.codigo === RECEITA2);
  assert.equal(doRECEITA.descricao, "COLEÇÃO");
  assert.equal(doRECEITA.sinal, 1);
  assert.equal(doRECEITA.total.planejado, 1000);
  assert.equal(doRECEITA2.sinal, -1);
  assert.equal(doRECEITA2.total.planejado, -300);
  // Soma do detalhe bate com o total da linha — mesmo cálculo, duas formas.
  assert.equal(doRECEITA.total.planejado + doRECEITA2.total.planejado, receita.total.planejado);
});

test("linha com uma conta só também ganha detalhe (1 item) — dá pra conferir sem sair da tela", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "so-uma", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  const soUma = linha(linhas, "so-uma");
  assert.equal(soUma.detalhe.length, 1);
  assert.equal(soUma.detalhe[0].codigo, RECEITA);
  assert.equal(soUma.detalhe[0].total.planejado, soUma.total.planejado);
});

test("linha sem recorte (soma o módulo inteiro) não ganha detalhe — não há lista curta pra mostrar", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "modulo-inteiro", ordem: 1, titulo: "Operacionais", origem: "modulo", moduloId: "despesas-operacionais", valores: [], sinal: -1, mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "modulo-inteiro").detalhe, null);
});

test('"Total" dentro do recorte expande pras contas reais do módulo no centro, com o sinal daquela entrada', () => {
  const visao = comLinhas(visaoBase(), [
    {
      id: "total-menos-uma",
      ordem: 1,
      titulo: "Tudo, menos o saldo",
      origem: "modulo",
      moduloId: "receita-vendas",
      valores: [
        { codigo: TOTAL_MODULO_TOKEN, sinal: 1 },
        { codigo: RECEITA2, sinal: -1 },
      ],
      mostra: true,
    },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  const total = linha(linhas, "total-menos-uma");

  // Total (RECEITA 1000 + RECEITA2 300 = 1300) - RECEITA2 (300) = 1000.
  assert.equal(total.total.planejado, 1000);

  // Detalhe mostra as DUAS parcelas do "Total" (uma por conta do módulo
  // nesse centro) MAIS a entrada explícita de RECEITA2 — sem juntar as
  // duas aparições de RECEITA2, porque é isso que cancela ela no total.
  assert.equal(total.detalhe.length, 3);
  const doTotal = total.detalhe.filter((item) => item.sinal === 1);
  const daExplicita = total.detalhe.filter((item) => item.sinal === -1);
  assert.equal(doTotal.length, 2);
  assert.equal(daExplicita.length, 1);
  assert.equal(daExplicita[0].codigo, RECEITA2);
});

test("cada conta escolhida tem o próprio sinal, não um sinal só pra linha inteira", () => {
  const visao = comLinhas(visaoBase(), [
    {
      id: "misto",
      ordem: 1,
      titulo: "Uma receita soma, a outra subtrai, na mesma linha",
      origem: "modulo",
      moduloId: "receita-vendas",
      valores: [
        { codigo: RECEITA, sinal: 1 },
        { codigo: RECEITA2, sinal: -1 },
      ],
      mostra: true,
    },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  // 1000 (RECEITA, +) + (-300) (RECEITA2, -) = 700, na MESMA linha.
  assert.equal(linha(linhas, "misto").total.planejado, 700);
  // Realizado segue a mesma regra: 2000 - 600 = 1400.
  assert.equal(linha(linhas, "misto").meses[0].realizado, 1400);
});

test("realizado e ano anterior vêm dos índices, com o mesmo sinal da linha", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
  ]);
  const linhas = calcularDre({
    visao,
    plano: plano(),
    filiais: FILIAIS,
    meses: [1],
    catalogo,
    realizado,
    realizadoAnterior: anterior,
  });
  const receita = linha(linhas, "receita");
  assert.equal(receita.meses[0].realizado, 2000);
  assert.equal(receita.meses[0].anterior, 1500);
});

// ---------------------------------------------------------------------------
// Linha "origem: formula"
// ---------------------------------------------------------------------------

test("linha fórmula soma/subtrai outras linhas por L[id]", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
    { id: "deducao", ordem: 2, titulo: "Dedução", origem: "modulo", moduloId: "deducoes-vendas", valores: [{ codigo: DEDUCAO, sinal: -1 }], mostra: true },
    { id: "rol", ordem: 3, titulo: "Receita líquida", origem: "formula", formula: "L[receita]+L[deducao]", mostra: true, destaca: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  // 1000 + (-100) = 900
  assert.equal(linha(linhas, "rol").total.planejado, 900);
});

test("fórmula de linha aceita V[conta] direto, além de L[linha] — acha o módulo sozinha", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "direto", ordem: 1, titulo: "Receita direto da conta", origem: "formula", formula: `V[${RECEITA}]`, mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "direto").total.planejado, 1000);
});

test("fórmula de linha mistura V[conta] e L[linha] na mesma expressão", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "deducao", ordem: 1, titulo: "Dedução", origem: "modulo", moduloId: "deducoes-vendas", valores: [{ codigo: DEDUCAO, sinal: -1 }], mostra: true },
    { id: "misto", ordem: 2, titulo: "Receita direto + linha", origem: "formula", formula: `V[${RECEITA}]+L[deducao]`, mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  // 1000 (V[RECEITA], direto) + (-100) (L[deducao], já com o sinal da linha) = 900.
  assert.equal(linha(linhas, "misto").total.planejado, 900);
});

test("V[conta] de conta que não está configurada em nenhum módulo vale 0, não quebra", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "orfa", ordem: 1, titulo: "Órfã", origem: "formula", formula: "V[9.9.9.99.999]", mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "orfa").total.planejado, 0);
});

test("fórmula de linha rejeita prefixo que não é L nem V", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "estranha", ordem: 1, titulo: "Estranha", origem: "formula", formula: `X[${RECEITA}]`, mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  // Fórmula quebrada não derruba o demonstrativo — vira 0.
  assert.equal(linha(linhas, "estranha").total.planejado, 0);
});

test("referência circular entre linhas fórmula vira 0, não trava", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "a", ordem: 1, titulo: "A", origem: "formula", formula: "L[b]", mostra: true },
    { id: "b", ordem: 2, titulo: "B", origem: "formula", formula: "L[a]", mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "a").total.planejado, 0);
  assert.equal(linha(linhas, "b").total.planejado, 0);
});

test("fórmula pode encadear (subtotal em cima de subtotal)", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
    { id: "deducao", ordem: 2, titulo: "Dedução", origem: "modulo", moduloId: "deducoes-vendas", valores: [{ codigo: DEDUCAO, sinal: -1 }], mostra: true },
    { id: "rol", ordem: 3, titulo: "ROL", origem: "formula", formula: "L[receita]+L[deducao]", mostra: true },
    { id: "op", ordem: 4, titulo: "Operacionais", origem: "modulo", moduloId: "despesas-operacionais", valores: [{ codigo: DESPESA_OP, sinal: -1 }], mostra: true },
    { id: "resultado", ordem: 5, titulo: "Resultado", origem: "formula", formula: "L[rol]+L[op]", mostra: true, destaca: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  // (1000 - 100) - 150 = 750
  assert.equal(linha(linhas, "resultado").total.planejado, 750);
});

// ---------------------------------------------------------------------------
// Análise vertical
// ---------------------------------------------------------------------------

test("análise vertical é a participação sobre a linha marcada base", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true, baseAnaliseVertical: true },
    { id: "deducao", ordem: 2, titulo: "Dedução", origem: "modulo", moduloId: "deducoes-vendas", valores: [{ codigo: DEDUCAO, sinal: -1 }], mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "receita").meses[0].analiseVerticalPlanejado, 100);
  assert.equal(linha(linhas, "deducao").meses[0].analiseVerticalPlanejado, -10);
});

test("sem linha base, análise vertical fica em zero, não divide por nada", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "receita").meses[0].analiseVerticalPlanejado, 0);
});

// ---------------------------------------------------------------------------
// Grupo de centro de custo
// ---------------------------------------------------------------------------

test("grupo de centro de custo restringe quais centros entram na soma", () => {
  let visao = visaoBase();
  visao = definirContasDoCentro(visao, "receita-vendas", "000001", OUTRO_CENTRO, [RECEITA]);
  const p = {
    ...criarPlano("p1", "Oficial", ANO, "v1"),
    planejado: {
      ...planejado,
      [chavePlanejado("receita-vendas", "000001", OUTRO_CENTRO, RECEITA, 1)]: 500,
    },
  };
  visao = comLinhas(visao, [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
  ]);

  const semGrupo = calcularDre({ visao, plano: p, filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(semGrupo, "receita").total.planejado, 1500, "sem grupo, soma os dois centros");

  const comGrupo = calcularDre({
    visao,
    plano: p,
    filiais: FILIAIS,
    meses: [1],
    catalogo,
    realizado,
    centrosPermitidos: new Set([CENTRO]),
  });
  assert.equal(linha(comGrupo, "receita").total.planejado, 1000, "com grupo, só o centro 002");
});

// ---------------------------------------------------------------------------
// Período e casos vazios
// ---------------------------------------------------------------------------

test("mesesDoPeriodo cobre o intervalo, mesmo se vier invertido", () => {
  assert.deepEqual(mesesDoPeriodo(3, 6), [3, 4, 5, 6]);
  assert.deepEqual(mesesDoPeriodo(6, 3), [3, 4, 5, 6]);
  assert.deepEqual(mesesDoPeriodo(1, 1), [1]);
});

test("mesesDoPeriodo prende o intervalo entre 1 e 12", () => {
  assert.deepEqual(mesesDoPeriodo(0, 15), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("sem modelo de DRE (dreLinhas vazio), devolve lista vazia", () => {
  const visao = comLinhas(visaoBase(), []);
  assert.deepEqual(calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado }), []);
});

test("sem plano ou sem filial, devolve lista vazia", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: true },
  ]);
  assert.deepEqual(calcularDre({ visao, plano: null, filiais: FILIAIS, meses: [1] }), []);
  assert.deepEqual(calcularDre({ visao, plano: plano(), filiais: [], meses: [1] }), []);
});

test("linha com mostra:false continua calculada (serve de base pra fórmula), só não teria mostra na tela", () => {
  const visao = comLinhas(visaoBase(), [
    { id: "receita", ordem: 1, titulo: "Receita", origem: "modulo", moduloId: "receita-vendas", valores: [{ codigo: RECEITA, sinal: 1 }], mostra: false },
    { id: "dobro", ordem: 2, titulo: "Dobro", origem: "formula", formula: "L[receita]*2", mostra: true },
  ]);
  const linhas = calcularDre({ visao, plano: plano(), filiais: FILIAIS, meses: [1], catalogo, realizado });
  assert.equal(linha(linhas, "receita").mostra, false);
  assert.equal(linha(linhas, "dobro").total.planejado, 2000);
});
