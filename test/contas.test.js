import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ancestrais,
  ancestralMarcado,
  contarMarcadosAbaixo,
  filtrarPorGrupo,
  conta,
  expandirComDescendentes,
  indexarContas,
  linhasDaArvore,
  paiDaClassificacao,
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
// Expansão para somar o realizado
// ---------------------------------------------------------------------------

test("marcar um grupo vale pelos descendentes", () => {
  // Grupo não recebe lançamento: o movimento fica nas folhas. Sem a expansão,
  // selecionar "3.1.1.01 RECEITA BRUTA DE VENDAS" daria total zero.
  const codigos = expandirComDescendentes(catalogo, ["3.1.1.01"]);
  assert.deepEqual([...codigos].sort(), ["3.1.1.01", "3.1.1.01.001", "3.1.1.01.002"]);
});

test("expansão desce a árvore inteira", () => {
  const codigos = expandirComDescendentes(catalogo, ["3.1"]);
  assert.ok(codigos.has("3.1.1.01.001"), "bisneto tem que entrar");
  assert.ok(codigos.has("3.1.1.02.001"));
  assert.ok(!codigos.has("4.1"), "outro ramo não entra");
});

test("expansão pula o buraco da árvore", () => {
  assert.ok(expandirComDescendentes(catalogo, ["4.1"]).has("4.1.2.01.001"));
});

test("grupo e folha marcados juntos não duplicam", () => {
  // Devolve Set justamente para isso: com array o valor da folha entraria duas
  // vezes na soma do realizado.
  const codigos = expandirComDescendentes(catalogo, ["3.1.1.01", "3.1.1.01.002"]);
  assert.equal(codigos.size, 3);
});

test("folha expande só para ela mesma", () => {
  assert.deepEqual([...expandirComDescendentes(catalogo, ["3.1.1.01.001"])], ["3.1.1.01.001"]);
});

test("código fora do catálogo é mantido, não descartado", () => {
  // A visão pode referenciar uma classificação que saiu do ERP; sumir com ela em
  // silêncio esconderia o problema.
  assert.ok(expandirComDescendentes(catalogo, ["9.9"]).has("9.9"));
});

// ---------------------------------------------------------------------------
// Filtro por LX_GRUPO_CONTABIL
// ---------------------------------------------------------------------------

test("filtro por grupo mantém só as contas do grupo como selecionáveis", () => {
  const receita = filtrarPorGrupo(catalogo, "R");
  const selecionaveis = receita.lista.filter((i) => i.selecionavel).map((i) => i.codigo);

  assert.ok(selecionaveis.includes("3.1.1.01.001"));
  assert.ok(!selecionaveis.includes("4.1"), "4.1 é DF");
  assert.ok(!selecionaveis.includes("4.1.2.01.001"), "é DV");
  assert.ok(receita.lista.every((i) => !i.selecionavel || i.grupo === "R"));
});

test("ancestral de outro grupo entra como estrutura, não selecionável", () => {
  // 4.1 é DF e 4.1.2.01 é DV: no filtro DV o pai aparece para dar hierarquia,
  // mas marcá-lo puxaria contas DF para um módulo DV.
  const variavel = filtrarPorGrupo(catalogo, "DV");
  const pai = variavel.porCodigo.get("4.1");

  assert.ok(pai, "o pai tem que aparecer");
  assert.equal(pai.selecionavel, false);
  assert.equal(variavel.porCodigo.get("4.1.2.01").selecionavel, true);
});

test("filtro preserva a hierarquia dos que ficaram", () => {
  const variavel = filtrarPorGrupo(catalogo, "DV");
  assert.deepEqual(variavel.raizes, ["4.1"]);
  assert.deepEqual(variavel.filhos.get("4.1"), ["4.1.2.01"]);
  assert.deepEqual(variavel.filhos.get("4.1.2.01"), ["4.1.2.01.001"]);
});

test("filtro mantém a ordem do plano de contas", () => {
  const receita = filtrarPorGrupo(catalogo, "R");
  const ordem = receita.lista.map((i) => i.codigo);
  assert.deepEqual(ordem, [...ordem].sort());
});

test("grupo sem nenhuma conta devolve catálogo vazio", () => {
  const vazio = filtrarPorGrupo(catalogo, "XX");
  assert.deepEqual(vazio.lista, []);
  assert.deepEqual(vazio.raizes, []);
});

test("sem grupo informado devolve o catálogo inteiro", () => {
  assert.equal(filtrarPorGrupo(catalogo, null), catalogo);
});

test("expansão com grupo ignora descendente de outro grupo", () => {
  // Marcar 4.1 (DF) num módulo DF não pode trazer 4.1.2.01, que é DV.
  const comoDf = expandirComDescendentes(catalogo, ["4.1"], "DF");
  assert.ok(comoDf.has("4.1"));
  assert.ok(!comoDf.has("4.1.2.01"));
  assert.ok(!comoDf.has("4.1.2.01.001"));
});

test("expansão com grupo continua descendo por nós que não casam", () => {
  // A descida não pode parar no primeiro nó fora do grupo: um DF pode ter filho
  // DV com neto DF.
  const misto = indexarContas([
    { codigo: "9.1", descricao: "topo DF", totalizaEm: null, sintetica: true, grupo: "DF" },
    { codigo: "9.1.01", descricao: "meio DV", totalizaEm: "9.1", sintetica: true, grupo: "DV" },
    { codigo: "9.1.01.001", descricao: "folha DF", totalizaEm: "9.1.01", sintetica: false, grupo: "DF" },
  ]);
  const comoDf = expandirComDescendentes(misto, ["9.1"], "DF");
  assert.deepEqual([...comoDf].sort(), ["9.1", "9.1.01.001"]);
});

// ---------------------------------------------------------------------------
// Contador de marcados abaixo
// ---------------------------------------------------------------------------

test("conta os marcados abaixo de um nó, em qualquer profundidade", () => {
  // Com a árvore recolhida é o único sinal de que há seleção escondida.
  const marcadas = new Set(["3.1.1.01.001", "3.1.1.02.001"]);
  assert.equal(contarMarcadosAbaixo(catalogo, "3.1", marcadas), 2);
  assert.equal(contarMarcadosAbaixo(catalogo, "3.1.1.01", marcadas), 1);
  assert.equal(contarMarcadosAbaixo(catalogo, "4.1", marcadas), 0);
});

test("o próprio nó marcado não conta como abaixo dele", () => {
  const marcadas = new Set(["3.1.1.01"]);
  assert.equal(contarMarcadosAbaixo(catalogo, "3.1.1.01", marcadas), 0);
  assert.equal(contarMarcadosAbaixo(catalogo, "3.1.1", marcadas), 1);
});

// ---------------------------------------------------------------------------
// Herança: conta incluída por um ancestral marcado
// ---------------------------------------------------------------------------

test("ancestralMarcado aponta quem inclui a conta", () => {
  // A tela mostrava o filho desmarcado com o pai marcado, o que parecia dizer
  // que ele estava fora — quando na verdade a soma já o incluía.
  const marcadas = new Set(["3.1.1"]);
  assert.equal(ancestralMarcado(catalogo, "3.1.1.01", marcadas), "3.1.1");
  assert.equal(ancestralMarcado(catalogo, "3.1.1.01.001", marcadas), "3.1.1");
});

test("sem ancestral marcado a conta não é herdada", () => {
  assert.equal(ancestralMarcado(catalogo, "3.1.1.01.001", new Set()), null);
  assert.equal(ancestralMarcado(catalogo, "3.1.1.01.001", new Set(["4.1"])), null);
});

test("herança vem do ancestral marcado mais próximo", () => {
  // Com pai e avô marcados, quem "inclui" é o pai: é o que o usuário desmarca
  // para voltar a escolher conta por conta.
  const marcadas = new Set(["3.1", "3.1.1.01"]);
  assert.equal(ancestralMarcado(catalogo, "3.1.1.01.001", marcadas), "3.1.1.01");
});

test("raiz nunca é herdada", () => {
  assert.equal(ancestralMarcado(catalogo, "3.1", new Set(["3.1"])), null);
});

test("herança atravessa o buraco da árvore", () => {
  // "4.1.2" não existe; a herança tem que vir de "4.1".
  assert.equal(ancestralMarcado(catalogo, "4.1.2.01.001", new Set(["4.1"])), "4.1");
});

test("o que a tela mostra bate com o que a soma inclui", () => {
  // Invariante: marcada OU herdada <=> está na expansão que soma o realizado.
  const marcadas = new Set(["3.1.1"]);
  const naSoma = expandirComDescendentes(catalogo, [...marcadas], "R");

  catalogo.lista
    .filter((item) => item.grupo === "R")
    .forEach((item) => {
      const naTela = marcadas.has(item.codigo) || !!ancestralMarcado(catalogo, item.codigo, marcadas);
      assert.equal(naTela, naSoma.has(item.codigo), `divergência em ${item.codigo}`);
    });
});
