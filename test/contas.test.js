import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ancestrais,
  codigosDaSubarvore,
  conta,
  contasEfetivas,
  desmarcarEmCascata,
  estadoDaSelecao,
  filtrarPorGrupo,
  indexarContas,
  linhasDaArvore,
  marcarEmCascata,
  paiDaClassificacao,
  recortarPara,
  resumirSelecao,
} from "../src/dados/contas.js";

// Recorte real de /api/contas (dbo.CTB_VISAO, visão 25).
const BRUTO = [
  { codigo: "3.1", descricao: "RECEITAS OPERACIONAIS", totalizaEm: null, sintetica: true, grupo: "R" },
  { codigo: "3.1.1", descricao: "RECEITA OPERACIONAL BRUTA - ROB", totalizaEm: "3.1", sintetica: true, grupo: "R" },
  { codigo: "3.1.1.01", descricao: "RECEITA BRUTA DE VENDAS", totalizaEm: "3.1.1", sintetica: true, grupo: "R" },
  { codigo: "3.1.1.01.001", descricao: "VENDAS DE PRODUTOS - COLEÇÃO", totalizaEm: "3.1.1.01", sintetica: false, grupo: "R" },
  { codigo: "3.1.1.01.002", descricao: "VENDAS DE PRODUTOS - SALDO", totalizaEm: "3.1.1.01", sintetica: false, grupo: "R" },
  { codigo: "3.1.1.02", descricao: "RECEITA DE PRESTAÇÃO DE SERVIÇOS", totalizaEm: "3.1.1", sintetica: true, grupo: "R" },
  { codigo: "3.1.1.02.001", descricao: "SERVIÇOS PRESTADOS MERCADO INTERNO", totalizaEm: "3.1.1.02", sintetica: false, grupo: "R" },
  { codigo: "4.1", descricao: "CUSTOS PRODUTOS/MERC./SERV VENDIDOS", totalizaEm: null, sintetica: true, grupo: "DF" },
  // Buraco real da visão 25: "4.1.2" não existe na tabela.
  { codigo: "4.1.2.01", descricao: "CUSTOS DAS MERCADORIAS VENDIDAS", totalizaEm: "4.1", sintetica: true, grupo: "DV" },
  { codigo: "4.1.2.01.001", descricao: "CMV COLEÇÃO", totalizaEm: "4.1.2.01", sintetica: false, grupo: "DV" },
];

const catalogo = indexarContas(BRUTO);

test("pai é o código sem o último segmento", () => {
  assert.equal(paiDaClassificacao("3.1.1.01.001"), "3.1.1.01");
  assert.equal(paiDaClassificacao("3.1"), "3");
  assert.equal(paiDaClassificacao("3"), null);
});

test("raízes são os nós sem ancestral no catálogo", () => {
  // O nó "3" e o "4" não existem na tabela: 3.1 e 4.1 são raiz.
  assert.deepEqual(catalogo.raizes, ["3.1", "4.1"]);
});

test("buraco na árvore não cria raiz falsa", () => {
  // "4.1.2" não existe. Sem subir até "4.1", o nó "4.1.2.01" apareceria no mesmo
  // nível de "3.1", como se fosse um grupo de topo.
  assert.ok(!catalogo.raizes.includes("4.1.2.01"));
  assert.deepEqual(catalogo.filhos.get("4.1"), ["4.1.2.01"]);
});

test("filhos seguem o prefixo do código, não totalizaEm", () => {
  assert.deepEqual(catalogo.filhos.get("3.1"), ["3.1.1"]);
  assert.deepEqual(catalogo.filhos.get("3.1.1"), ["3.1.1.01", "3.1.1.02"]);
  assert.deepEqual(catalogo.filhos.get("3.1.1.01"), ["3.1.1.01.001", "3.1.1.01.002"]);
});

test("catálogo vazio não quebra", () => {
  const vazio = indexarContas(undefined);
  assert.deepEqual(vazio.lista, []);
  assert.deepEqual(vazio.raizes, []);
  assert.equal(conta(vazio, "3.1"), null);
  assert.deepEqual(linhasDaArvore(vazio, new Set()), []);
});

// ---------------------------------------------------------------------------
// Árvore achatada
// ---------------------------------------------------------------------------

test("só as raízes aparecem com tudo recolhido", () => {
  const linhas = linhasDaArvore(catalogo, new Set());
  assert.deepEqual(
    linhas.map((l) => l.codigo),
    ["3.1", "4.1"]
  );
  assert.equal(linhas[0].nivel, 0);
  assert.equal(linhas[0].temFilhos, true);
  assert.equal(linhas[0].aberto, false);
});

test("abrir um nó mostra os filhos diretos, não os netos", () => {
  const linhas = linhasDaArvore(catalogo, new Set(["3.1"]));
  assert.deepEqual(
    linhas.map((l) => l.codigo),
    ["3.1", "3.1.1", "4.1"]
  );
  assert.equal(linhas[1].nivel, 1);
});

test("nível é a profundidade na árvore, não a contagem de pontos", () => {
  // "4.1.2.01" tem 3 pontos mas é filho direto de "4.1": nível 1.
  const linhas = linhasDaArvore(catalogo, new Set(["4.1"]));
  const item = linhas.find((l) => l.codigo === "4.1.2.01");
  assert.equal(item.nivel, 1);
});

test("folha não tem filhos", () => {
  const linhas = linhasDaArvore(catalogo, new Set(["3.1", "3.1.1", "3.1.1.01"]));
  const folha = linhas.find((l) => l.codigo === "3.1.1.01.001");
  assert.equal(folha.temFilhos, false);
  assert.equal(folha.nivel, 3);
});

test("ancestrais devolvem o caminho da raiz para baixo", () => {
  assert.deepEqual(ancestrais(catalogo, "3.1.1.01.001"), ["3.1", "3.1.1", "3.1.1.01"]);
  assert.deepEqual(ancestrais(catalogo, "4.1.2.01.001"), ["4.1", "4.1.2.01"]);
  assert.deepEqual(ancestrais(catalogo, "3.1"), []);
});

// ---------------------------------------------------------------------------
// Filtro por LX_GRUPO_CONTABIL
// ---------------------------------------------------------------------------

test("filtro por grupo mantém só as contas do grupo como selecionáveis", () => {
  const receita = filtrarPorGrupo(catalogo, "R");
  const selecionaveis = receita.lista.filter((i) => i.selecionavel).map((i) => i.codigo);

  assert.ok(selecionaveis.includes("3.1.1.01.001"));
  assert.ok(!selecionaveis.includes("4.1"), "4.1 é DF");
  assert.ok(receita.lista.every((i) => !i.selecionavel || i.grupo === "R"));
});

test("ancestral de outro grupo entra como estrutura, não selecionável", () => {
  // 4.1 é DF e 4.1.2.01 é DV: no filtro DV o pai aparece para dar hierarquia,
  // mas marcá-lo puxaria contas DF para um módulo DV.
  const variavel = filtrarPorGrupo(catalogo, "DV");
  assert.equal(variavel.porCodigo.get("4.1").selecionavel, false);
  assert.equal(variavel.porCodigo.get("4.1.2.01").selecionavel, true);
});

test("filtro preserva a hierarquia dos que ficaram", () => {
  const variavel = filtrarPorGrupo(catalogo, "DV");
  assert.deepEqual(variavel.raizes, ["4.1"]);
  assert.deepEqual(variavel.filhos.get("4.1"), ["4.1.2.01"]);
});

test("sem grupo informado devolve o catálogo inteiro", () => {
  assert.equal(filtrarPorGrupo(catalogo, null), catalogo);
});

// ---------------------------------------------------------------------------
// Seleção em cascata
// ---------------------------------------------------------------------------

test("marcar um nó marca a subárvore inteira", () => {
  const marcadas = marcarEmCascata(catalogo, new Set(), "3.1.1");
  assert.deepEqual(
    [...marcadas].sort(),
    ["3.1.1", "3.1.1.01", "3.1.1.01.001", "3.1.1.01.002", "3.1.1.02", "3.1.1.02.001"]
  );
});

test("marcar uma folha marca só ela", () => {
  const marcadas = marcarEmCascata(catalogo, new Set(), "3.1.1.01.001");
  assert.deepEqual([...marcadas], ["3.1.1.01.001"]);
});

test("desmarcar tira a subárvore e os ancestrais", () => {
  // O pai marcado significa "tudo abaixo marcado". Mantê-lo depois de desmarcar
  // um filho quebraria essa leitura — e a soma contaria como se a exclusão não
  // existisse.
  const cheio = marcarEmCascata(catalogo, new Set(), "3.1");
  const semServicos = desmarcarEmCascata(catalogo, cheio, "3.1.1.02");

  assert.ok(!semServicos.has("3.1.1.02"));
  assert.ok(!semServicos.has("3.1.1.02.001"), "o filho do desmarcado também sai");
  assert.ok(!semServicos.has("3.1.1"), "o pai deixa de estar cheio");
  assert.ok(!semServicos.has("3.1"), "o avô também");
  assert.ok(semServicos.has("3.1.1.01.001"), "o irmão continua marcado");
});

test("cascata atravessa nó de outro grupo", () => {
  // 4.1 é DF, 4.1.2.01 é DV: a descida não pode parar no primeiro nó de fora.
  const dv = filtrarPorGrupo(catalogo, "DV");
  const codigos = codigosDaSubarvore(dv, "4.1");
  assert.ok(!codigos.includes("4.1"), "4.1 é só estrutura no filtro DV");
  assert.deepEqual(codigos.sort(), ["4.1.2.01", "4.1.2.01.001"]);
});

test("estado é vazio, parcial ou total", () => {
  const vazio = resumirSelecao(catalogo, new Set());
  assert.equal(estadoDaSelecao(vazio, "3.1.1"), "vazio");

  const cheio = resumirSelecao(catalogo, marcarEmCascata(catalogo, new Set(), "3.1.1"));
  assert.equal(estadoDaSelecao(cheio, "3.1.1"), "total");
  assert.equal(estadoDaSelecao(cheio, "3.1.1.01"), "total");
  assert.equal(estadoDaSelecao(cheio, "3.1"), "parcial", "3.1 em si não está marcado");

  const parcial = resumirSelecao(catalogo, new Set(["3.1.1.01.001"]));
  assert.equal(estadoDaSelecao(parcial, "3.1.1.01"), "parcial");
  assert.equal(estadoDaSelecao(parcial, "3.1.1.01.001"), "total");
  assert.equal(estadoDaSelecao(parcial, "3.1.1.02"), "vazio");
});

test("resumo conta a subárvore incluindo o próprio nó", () => {
  const resumo = resumirSelecao(catalogo, new Set(["3.1.1.01", "3.1.1.01.001"]));
  const r = resumo.get("3.1.1.01");
  assert.equal(r.total, 3, "ele + duas folhas");
  assert.equal(r.marcados, 2);
});

test("estrutura de outro grupo não conta no total da subárvore", () => {
  const dv = filtrarPorGrupo(catalogo, "DV");
  const resumo = resumirSelecao(dv, new Set());
  // 4.1 é estrutura: só 4.1.2.01 e 4.1.2.01.001 são selecionáveis.
  assert.equal(resumo.get("4.1").total, 2);
});

// ---------------------------------------------------------------------------
// Contas que entram na soma
// ---------------------------------------------------------------------------

test("a soma usa exatamente o que está marcado, sem expandir", () => {
  // Regressão do modelo anterior: expandir aqui fazia desmarcar uma conta
  // isolada não surtir efeito no total.
  const efetivas = contasEfetivas(catalogo, ["3.1.1.01"], "R");
  assert.deepEqual([...efetivas], ["3.1.1.01"]);
});

test("a soma descarta conta de outro grupo contábil", () => {
  assert.deepEqual([...contasEfetivas(catalogo, ["3.1.1.01.001", "4.1.2.01.001"], "R")], [
    "3.1.1.01.001",
  ]);
  assert.deepEqual([...contasEfetivas(catalogo, ["3.1.1.01.001", "4.1.2.01.001"], "DV")], [
    "4.1.2.01.001",
  ]);
});

test("código fora do catálogo é mantido, não descartado", () => {
  // A visão pode referenciar classificação que saiu do ERP; sumir com ela em
  // silêncio esconderia o problema.
  assert.ok(contasEfetivas(catalogo, ["9.9"], "R").has("9.9"));
});

test("o que a tela mostra bate com o que a soma inclui", () => {
  // Invariante da cascata: marcada na tela <=> entra na soma.
  const marcadas = desmarcarEmCascata(
    catalogo,
    marcarEmCascata(catalogo, new Set(), "3.1.1"),
    "3.1.1.02"
  );
  const resumo = resumirSelecao(catalogo, marcadas);
  const naSoma = contasEfetivas(catalogo, [...marcadas], "R");

  catalogo.lista
    .filter((item) => item.grupo === "R")
    .forEach((item) => {
      const cheiaNaTela = estadoDaSelecao(resumo, item.codigo) === "total";
      const folha = !(catalogo.filhos.get(item.codigo) ?? []).length;
      if (folha) {
        assert.equal(cheiaNaTela, naSoma.has(item.codigo), `divergência em ${item.codigo}`);
      }
    });
});

// ---------------------------------------------------------------------------
// Recorte para o centro de custo
//
// O centro escolhe entre as contas que a filial já orça. O recorte precisa
// reconstruir a árvore: reaproveitar `filhos` e `raizes` do catálogo de origem
// deixava ponteiros para nós que saíram, a descida parava neles e a subárvore
// inteira sumia da tela.
// ---------------------------------------------------------------------------

const paraRecorte = indexarContas([
  // Raiz que é conta selecionável, como na visão 25 (4.2 LUCRO BRUTO).
  { codigo: "4.2", descricao: "LUCRO BRUTO OPERACIONAL", totalizaEm: null, sintetica: true, grupo: "DF" },
  { codigo: "4.2.1", descricao: "CUSTOS DIRETOS", totalizaEm: null, sintetica: true, grupo: "DF" },
  { codigo: "4.2.1.01.001", descricao: "SETOR PRODUÇÃO", totalizaEm: null, sintetica: false, grupo: "DF" },
  { codigo: "4.2.1.01.002", descricao: "SETOR CORTE", totalizaEm: null, sintetica: false, grupo: "DF" },
  { codigo: "4.4", descricao: "DESPESAS OPERACIONAIS", totalizaEm: null, sintetica: true, grupo: "DF" },
  { codigo: "4.4.1.01.001", descricao: "ALUGUEL", totalizaEm: null, sintetica: false, grupo: "DF" },
]);

test("recorte mantém o caminho até a conta, mesmo quando a raiz é conta", () => {
  const recorte = recortarPara(paraRecorte, ["4.2.1.01.001"]);

  // Sem os ancestrais a conta ficaria órfã e a árvore não a alcançaria.
  assert.deepEqual(
    recorte.lista.map((item) => item.codigo),
    ["4.2", "4.2.1", "4.2.1.01.001"]
  );
  assert.deepEqual(recorte.raizes, ["4.2"]);
  assert.deepEqual(recorte.filhos.get("4.2"), ["4.2.1"]);
  assert.deepEqual(recorte.filhos.get("4.2.1"), ["4.2.1.01.001"]);
});

test("no recorte só as contas pedidas são selecionáveis", () => {
  const recorte = recortarPara(paraRecorte, ["4.2.1.01.001"]);
  const selecionavel = (codigo) => recorte.porCodigo.get(codigo).selecionavel;

  assert.equal(selecionavel("4.2.1.01.001"), true);
  assert.equal(selecionavel("4.2"), false, "ancestral entra como estrutura");
  assert.equal(selecionavel("4.2.1"), false);
});

test("a árvore do recorte é percorrível inteira", () => {
  const recorte = recortarPara(paraRecorte, ["4.2.1.01.001", "4.2.1.01.002", "4.4.1.01.001"]);
  const abertos = new Set(recorte.lista.map((item) => item.codigo));

  assert.deepEqual(
    linhasDaArvore(recorte, abertos).map((linha) => linha.codigo),
    ["4.2", "4.2.1", "4.2.1.01.001", "4.2.1.01.002", "4.4", "4.4.1.01.001"]
  );
});

test("recorte vazio devolve catálogo vazio, não a árvore inteira", () => {
  const recorte = recortarPara(paraRecorte, []);
  assert.deepEqual(recorte.lista, []);
  assert.deepEqual(recorte.raizes, []);
  assert.deepEqual(linhasDaArvore(recorte, new Set()), []);
});

test("marcar um ancestral do recorte puxa só as contas, não ele mesmo", () => {
  // É o que a caixa do nó de estrutura faz na tela do centro de custo.
  const recorte = recortarPara(paraRecorte, ["4.2.1.01.001", "4.2.1.01.002"]);
  const marcadas = marcarEmCascata(recorte, new Set(), "4.2.1");

  assert.deepEqual([...marcadas].sort(), ["4.2.1.01.001", "4.2.1.01.002"]);
  assert.equal(marcadas.has("4.2.1"), false, "o nó de estrutura não vira conta");
  assert.equal(marcadas.has("4.2"), false);
});

test("com todas as contas marcadas o ancestral fica total, não parcial", () => {
  const recorte = recortarPara(paraRecorte, ["4.2.1.01.001", "4.2.1.01.002"]);
  const marcadas = marcarEmCascata(recorte, new Set(), "4.2.1");
  const resumo = resumirSelecao(recorte, marcadas);

  // Se o ancestral contasse como conta, ele mesmo faltaria e o estado nunca
  // fecharia — a caixa ficaria em "parcial" para sempre.
  assert.equal(estadoDaSelecao(resumo, "4.2.1"), "total");
  assert.equal(estadoDaSelecao(resumo, "4.2"), "total");

  const parcial = resumirSelecao(recorte, new Set(["4.2.1.01.001"]));
  assert.equal(estadoDaSelecao(parcial, "4.2.1"), "parcial");
});
