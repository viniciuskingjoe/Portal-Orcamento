import { strict as assert } from "node:assert";
import { test } from "node:test";

import { MODULOS } from "../src/dados/modulos.js";
import {
  SEM_CENTRO,
  MODULO_OPERACIONAIS,
  MODULO_PESSOAL,
  centrosDaFilial,
  contasDaFilial,
  contasDoCentro,
  contasEfetivasDoModulo,
  contaEhCalculada,
  criarVisao,
  definirContasDoCentro,
  definirContasDoCentroExclusivo,
  definirFormulaDaConta,
  definirLinhaDre,
  definirUsoDoCentro,
  dreLinha,
  dreLinhasOrdenadas,
  centroEmUso,
  filiaisDoModulo,
  formulaDaConta,
  formulasDoModulo,
  moduloConfigurado,
  modulosDaVisao,
  removerLinhaDre,
  reordenarDreLinhas,
  resumoDaVisao,
  usaCentroDeCusto,
} from "../src/dados/visao.js";

const MODULO = "receita-vendas";
const DESPESA = "despesas-operacionais";
const FILIAL = "000025";
// Todo módulo é orçado por centro: montar a visão passa sempre por um.
const CENTRO = "002";
const OUTRA = "000001";

const nova = () => criarVisao("v1", "DRE 2026", "25");

test("visão nova guarda a visão contábil e não tem módulo configurado", () => {
  const visao = nova();
  assert.equal(visao.visaoContabil, "25");
  assert.deepEqual(modulosDaVisao(visao), []);
  assert.equal(moduloConfigurado(visao, MODULO), false);
});

test("contas são por filial, não do módulo inteiro", () => {
  let visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  visao = definirContasDoCentro(visao, MODULO, OUTRA, CENTRO, ["3.1.1.01.002", "3.1.1.01.003"]);

  assert.deepEqual(contasDaFilial(visao, MODULO, FILIAL), ["3.1.1.01.001"]);
  assert.deepEqual(contasDaFilial(visao, MODULO, OUTRA), ["3.1.1.01.002", "3.1.1.01.003"]);
  assert.deepEqual(filiaisDoModulo(visao, MODULO).sort(), [OUTRA, FILIAL].sort());
});

test("filial sem conta não conta como configurada", () => {
  const visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, []);
  assert.deepEqual(filiaisDoModulo(visao, MODULO), []);
  assert.equal(moduloConfigurado(visao, MODULO), false);
});

test("definir contas não muta a visão original", () => {
  const original = nova();
  const proxima = definirContasDoCentro(original, MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  assert.deepEqual(original.modulos, {});
  assert.notEqual(original, proxima);
});

// ---------------------------------------------------------------------------
// Centro de custo
// ---------------------------------------------------------------------------

// Já foi opcional, com um interruptor por módulo na tela. O resultado era que
// "de qual centro é esta despesa?" tinha resposta em alguns módulos e não em
// outros, o que impedia qualquer leitura por centro atravessando o DRE.
test("todo módulo é orçado por centro de custo", () => {
  const visao = nova();
  MODULOS.forEach((modulo) => {
    assert.equal(usaCentroDeCusto(visao, modulo.id), true, modulo.id);
  });
});

test("com centro, as contas da filial são a união dos centros", () => {
  // A ordem de uso é filial -> centros -> contas de cada centro. A lista da
  // filial deixa de ser escolha e vira o consolidado, que é o que a tela do
  // plano e o DRE leem.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "008", ["4.4.1.02", "4.4.1.09"]);

  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), ["4.4.1.01", "4.4.1.02", "4.4.1.09"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "008"), ["4.4.1.02", "4.4.1.09"]);
});

test("o centro não é mais recortado pela filial", () => {
  // Antes o centro escolhia entre as contas da filial; agora é ele quem define.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), ["4.4.1.01"]);
});

test("marcar o centro coloca ele em uso ainda sem conta", () => {
  let visao = nova();
  visao = definirUsoDoCentro(visao, DESPESA, FILIAL, "002", true);

  assert.equal(centroEmUso(visao, DESPESA, FILIAL, "002"), true);
  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["002"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), []);
  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), []);
});

test("desmarcar o centro leva as contas dele embora", () => {
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "008", ["4.4.1.02"]);

  visao = definirUsoDoCentro(visao, DESPESA, FILIAL, "002", false);
  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["008"]);
  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), ["4.4.1.02"]);
});

test("tirar conta da filial tira dos centros dela", () => {
  // Sem isso a soma do centro incluiria o que a filial não orça mais.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, CENTRO, ["4.4.1.01", "4.4.1.02"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01", "4.4.1.02"]);

  visao = definirContasDoCentro(visao, DESPESA, FILIAL, CENTRO, ["4.4.1.02"]);
  assert.deepEqual(contasDoCentro(visao, DESPESA, FILIAL, "002"), ["4.4.1.02"]);
});

test("centro esvaziado continua em uso", () => {
  // Vazio é um estado legítimo: o centro foi marcado e as contas ainda não.
  // Quem tira o centro do ar é a caixa de uso, não a falta de conta.
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", []);

  assert.deepEqual(centrosDaFilial(visao, DESPESA, FILIAL), ["002"]);
  assert.deepEqual(contasDaFilial(visao, DESPESA, FILIAL), []);
});

test("contas efetivas: sem centro é o consolidado, com centro é o do centro", () => {
  let visao = nova();
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "002", ["4.4.1.01"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, "008", ["4.4.1.02"]);

  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL), ["4.4.1.01", "4.4.1.02"]);
  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL, SEM_CENTRO), [
    "4.4.1.01",
    "4.4.1.02",
  ]);
  assert.deepEqual(contasEfetivasDoModulo(visao, DESPESA, FILIAL, "002"), ["4.4.1.01"]);
});

test("módulo que não usa centro ignora o centro pedido", () => {
  // Evita que um filtro de centro esvazie um módulo que não tem essa dimensão.
  const visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  assert.deepEqual(contasEfetivasDoModulo(visao, MODULO, FILIAL, "002"), ["3.1.1.01.001"]);
});

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------

test("resumo conta módulos, filiais e contas", () => {
  let visao = definirContasDoCentro(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001", "3.1.1.01.002"]);
  visao = definirContasDoCentro(visao, MODULO, OUTRA, CENTRO, ["3.1.1.01.001"]);
  visao = definirContasDoCentro(visao, DESPESA, FILIAL, CENTRO, ["4.4.1.01"]);

  const resumo = resumoDaVisao(visao);
  assert.equal(resumo.modulos, 2);
  assert.equal(resumo.filiais, 2, "filial repetida entre módulos conta uma vez");
  assert.equal(resumo.contas, 4);
  assert.equal(resumo.totalDeModulos, MODULOS.length);
});

test("os oito módulos fixos têm tipo e grupo contábil", () => {
  assert.equal(MODULOS.length, 8);
  MODULOS.forEach((item) => {
    assert.ok(["receita", "despesa"].includes(item.tipo), `${item.id} sem tipo`);
    assert.ok(["R", "DV", "DF"].includes(item.grupo), `${item.id} sem grupo`);
  });
});

// ---------------------------------------------------------------------------
// Exclusividade entre Despesas com pessoal e Despesas operacionais
//
// As três famílias de folha não podem estar somadas nos dois módulos ao mesmo
// tempo para o mesmo centro, senão o DRE e a publicação para o Linx dobram o
// valor — ver [[pessoal-nao-migrar-de-operacionais]].
// ---------------------------------------------------------------------------

const FOLHA = "4.2.1.10.001";

test("marcar a conta em Despesas com pessoal tira ela de Despesas operacionais no mesmo centro", () => {
  let visao = definirContasDoCentro(nova(), MODULO_OPERACIONAIS, FILIAL, CENTRO, [FOLHA, "4.4.1.01.001"]);
  visao = definirContasDoCentroExclusivo(visao, MODULO_PESSOAL, FILIAL, CENTRO, [FOLHA]);

  assert.deepEqual(contasDoCentro(visao, MODULO_PESSOAL, FILIAL, CENTRO), [FOLHA]);
  assert.deepEqual(contasDoCentro(visao, MODULO_OPERACIONAIS, FILIAL, CENTRO), ["4.4.1.01.001"]);
});

test("marcar a conta de volta em Despesas operacionais tira ela de Despesas com pessoal", () => {
  let visao = definirContasDoCentroExclusivo(nova(), MODULO_PESSOAL, FILIAL, CENTRO, [FOLHA]);
  visao = definirContasDoCentroExclusivo(visao, MODULO_OPERACIONAIS, FILIAL, CENTRO, [FOLHA]);

  assert.deepEqual(contasDoCentro(visao, MODULO_OPERACIONAIS, FILIAL, CENTRO), [FOLHA]);
  assert.deepEqual(contasDoCentro(visao, MODULO_PESSOAL, FILIAL, CENTRO), []);
});

test("exclusividade não mexe em outro centro nem em outro módulo", () => {
  let visao = definirContasDoCentro(nova(), MODULO_OPERACIONAIS, FILIAL, "999", [FOLHA]);
  visao = definirContasDoCentro(visao, MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  visao = definirContasDoCentroExclusivo(visao, MODULO_PESSOAL, FILIAL, CENTRO, [FOLHA]);

  assert.deepEqual(contasDoCentro(visao, MODULO_OPERACIONAIS, FILIAL, "999"), [FOLHA]);
  assert.deepEqual(contasDoCentro(visao, MODULO, FILIAL, CENTRO), ["3.1.1.01.001"]);
});

test("módulo fora do par não sofre nem causa exclusão", () => {
  const visao = definirContasDoCentroExclusivo(nova(), MODULO, FILIAL, CENTRO, ["3.1.1.01.001"]);
  assert.deepEqual(contasDoCentro(visao, MODULO, FILIAL, CENTRO), ["3.1.1.01.001"]);
});

// ---------------------------------------------------------------------------
// Fórmula por conta
// ---------------------------------------------------------------------------

test("conta nasce fixa: sem fórmula, não calculada", () => {
  const visao = nova();
  assert.equal(formulaDaConta(visao, MODULO_PESSOAL, FOLHA), null);
  assert.equal(contaEhCalculada(visao, MODULO_PESSOAL, FOLHA), false);
});

test("definir a fórmula marca a conta como calculada", () => {
  const visao = definirFormulaDaConta(nova(), MODULO_PESSOAL, FOLHA, "(V[a] + V[b]) / 12");
  assert.equal(contaEhCalculada(visao, MODULO_PESSOAL, FOLHA), true);
  assert.deepEqual(formulaDaConta(visao, MODULO_PESSOAL, FOLHA), { expressao: "(V[a] + V[b]) / 12" });
});

test("expressão vazia ou nula volta a conta para fixa", () => {
  let visao = definirFormulaDaConta(nova(), MODULO_PESSOAL, FOLHA, "V[a]/12");
  visao = definirFormulaDaConta(visao, MODULO_PESSOAL, FOLHA, "");
  assert.equal(contaEhCalculada(visao, MODULO_PESSOAL, FOLHA), false);

  visao = definirFormulaDaConta(definirFormulaDaConta(nova(), MODULO_PESSOAL, FOLHA, "V[a]"), MODULO_PESSOAL, FOLHA, null);
  assert.equal(contaEhCalculada(visao, MODULO_PESSOAL, FOLHA), false);
});

test("fórmula é por módulo: a mesma conta pode ser fixa num módulo e calculada noutro", () => {
  const visao = definirFormulaDaConta(nova(), MODULO_PESSOAL, FOLHA, "V[a]/12");
  assert.equal(contaEhCalculada(visao, MODULO_PESSOAL, FOLHA), true);
  assert.equal(contaEhCalculada(visao, MODULO_OPERACIONAIS, FOLHA), false);
});

test("formulasDoModulo nunca devolve undefined, mesmo sem nada definido", () => {
  assert.deepEqual(formulasDoModulo(nova(), MODULO_PESSOAL), {});
});

// ---------------------------------------------------------------------------
// Linhas do DRE
// ---------------------------------------------------------------------------

const LINHA_RECEITA = {
  id: "receita",
  ordem: 0,
  titulo: "Receita",
  origem: "modulo",
  moduloId: MODULO,
  sinal: 1,
  contas: ["3.1.1.01.001"],
  formula: null,
  mostra: true,
  destaca: false,
  baseAnaliseVertical: false,
  linhaPrincipal: false,
};

test("visão nova não tem linha de DRE nenhuma", () => {
  assert.deepEqual(dreLinhasOrdenadas(nova()), []);
  assert.equal(dreLinha(nova(), "receita"), null);
});

test("definirLinhaDre adiciona uma linha nova", () => {
  const visao = definirLinhaDre(nova(), LINHA_RECEITA);
  assert.deepEqual(dreLinha(visao, "receita"), LINHA_RECEITA);
  assert.equal(dreLinhasOrdenadas(visao).length, 1);
});

test("definirLinhaDre com o mesmo id substitui a linha inteira", () => {
  let visao = definirLinhaDre(nova(), LINHA_RECEITA);
  visao = definirLinhaDre(visao, { ...LINHA_RECEITA, titulo: "Receita bruta", destaca: true });
  assert.equal(dreLinhasOrdenadas(visao).length, 1);
  assert.equal(dreLinha(visao, "receita").titulo, "Receita bruta");
  assert.equal(dreLinha(visao, "receita").destaca, true);
});

test("dreLinhasOrdenadas respeita o campo ordem, não a ordem de inserção", () => {
  let visao = definirLinhaDre(nova(), { ...LINHA_RECEITA, id: "b", ordem: 1 });
  visao = definirLinhaDre(visao, { ...LINHA_RECEITA, id: "a", ordem: 0 });
  assert.deepEqual(dreLinhasOrdenadas(visao).map((l) => l.id), ["a", "b"]);
});

test("removerLinhaDre tira só a linha pedida", () => {
  let visao = definirLinhaDre(nova(), { ...LINHA_RECEITA, id: "a" });
  visao = definirLinhaDre(visao, { ...LINHA_RECEITA, id: "b" });
  visao = removerLinhaDre(visao, "a");
  assert.deepEqual(dreLinhasOrdenadas(visao).map((l) => l.id), ["b"]);
});

test("reordenarDreLinhas reescreve ordem a partir da posição no array de ids", () => {
  let visao = definirLinhaDre(nova(), { ...LINHA_RECEITA, id: "a", ordem: 0 });
  visao = definirLinhaDre(visao, { ...LINHA_RECEITA, id: "b", ordem: 1 });
  visao = definirLinhaDre(visao, { ...LINHA_RECEITA, id: "c", ordem: 2 });

  visao = reordenarDreLinhas(visao, ["c", "a", "b"]);
  const linhas = dreLinhasOrdenadas(visao);
  assert.deepEqual(linhas.map((l) => l.id), ["c", "a", "b"]);
  assert.deepEqual(linhas.map((l) => l.ordem), [0, 1, 2]);
});

test("reordenarDreLinhas ignora id que não existe mais", () => {
  let visao = definirLinhaDre(nova(), { ...LINHA_RECEITA, id: "a", ordem: 0 });
  visao = reordenarDreLinhas(visao, ["a", "fantasma"]);
  assert.deepEqual(dreLinhasOrdenadas(visao).map((l) => l.id), ["a"]);
});
