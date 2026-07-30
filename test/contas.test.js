import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ancestrais,
  conta,
  expandirComDescendentes,
  indexarContas,
  linhasDaArvore,
  paiDaClassificacao,
} from "../src/dados/contas.js";

// Recorte real de /api/contas (dbo.CTB_VISAO, visão 25).
const BRUTO = [
  { codigo: "3.1", descricao: "RECEITAS OPERACIONAIS", totalizaEm: null, sintetica: true },
  { codigo: "3.1.1", descricao: "RECEITA OPERACIONAL BRUTA - ROB", totalizaEm: "3.1", sintetica: true },
  { codigo: "3.1.1.01", descricao: "RECEITA BRUTA DE VENDAS", totalizaEm: "3.1.1", sintetica: true },
  { codigo: "3.1.1.01.001", descricao: "VENDAS DE PRODUTOS - COLEÇÃO", totalizaEm: "3.1.1.01", sintetica: false },
  { codigo: "3.1.1.01.002", descricao: "VENDAS DE PRODUTOS - SALDO", totalizaEm: "3.1.1.01", sintetica: false },
  { codigo: "3.1.1.02", descricao: "RECEITA DE PRESTAÇÃO DE SERVIÇOS", totalizaEm: "3.1.1", sintetica: true },
  { codigo: "3.1.1.02.001", descricao: "SERVIÇOS PRESTADOS MERCADO INTERNO", totalizaEm: "3.1.1.02", sintetica: false },
  { codigo: "4.1", descricao: "CUSTOS PRODUTOS/MERC./SERV VENDIDOS", totalizaEm: null, sintetica: true },
  // Buraco real da visão 25: "4.1.2" não existe na tabela.
  { codigo: "4.1.2.01", descricao: "CUSTOS DAS MERCADORIAS VENDIDAS", totalizaEm: "4.1", sintetica: true },
  { codigo: "4.1.2.01.001", descricao: "CMV COLEÇÃO", totalizaEm: "4.1.2.01", sintetica: false },
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
