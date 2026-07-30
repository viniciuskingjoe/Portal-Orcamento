import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  removerDimensao,
  totalDoModuloNoAno,
} from "../src/dados/plano.js";
import { criarVisao, definirContasDoModulo } from "../src/dados/visao.js";
import { mesesComRealizado } from "../src/dados/calendario.js";

const ANO = 2026;
const MODULO = "receita-vendas";

function visaoConfigurada() {
  return definirContasDoModulo(criarVisao("v1", "DRE 2025"), MODULO, [
    "3.1.1.01.001",
    "3.1.1.01.002",
  ]);
}

function planoBase(visaoId = "v1") {
  return criarPlano("teste", "Plano de teste", 2024, 2026, visaoId);
}

const linhasDeMes = (linhas) => linhas.filter((linha) => typeof linha.id === "number");
const totalDe = (linhas) => linhas.find((linha) => linha.id === "total");
const mediaDe = (linhas) => linhas.find((linha) => linha.id === "media");

// ---------------------------------------------------------------------------
// Visão x orçamento
// ---------------------------------------------------------------------------

test("módulo sem contas na visão fica zerado", () => {
  // Zerar é honesto: sem conta vinculada não há o que somar. O anterior seria
  // exibir número gerado para um módulo que o usuário nunca configurou.
  const plano = planoBase();
  const visao = criarVisao("v1", "Vazia");
  const linhas = criarLinhasOrcamento(plano, visao, MODULO, "total", ANO);

  assert.equal(linhas.length, 14, "12 meses + total + média");
  for (const linha of linhas) {
    assert.equal(linha.planejado, 0, `planejado de ${linha.label}`);
    assert.equal(linha.realizado, 0, `realizado de ${linha.label}`);
    assert.equal(linha.anterior, 0, `ano anterior de ${linha.label}`);
  }
});

test("módulo com contas na visão produz valores", () => {
  const total = totalDe(criarLinhasOrcamento(planoBase(), visaoConfigurada(), MODULO, "total", ANO));
  assert.ok(total.planejado > 0);
  assert.ok(total.realizado > 0);
});

test("módulo inexistente não quebra e devolve zeros", () => {
  const linhas = criarLinhasOrcamento(planoBase(), visaoConfigurada(), "nao-existe", "total", ANO);
  assert.equal(totalDe(linhas).planejado, 0);
});

test("visão ausente devolve zeros em vez de estourar", () => {
  const linhas = criarLinhasOrcamento(planoBase(null), null, MODULO, "total", ANO);
  assert.equal(totalDe(linhas).planejado, 0);
});

test("cada módulo configurado tem seu próprio valor", () => {
  let visao = visaoConfigurada();
  visao = definirContasDoModulo(visao, "despesas-pessoal", ["3.1.9.01.001"]);
  const plano = planoBase();

  const receita = totalDoModuloNoAno(plano, visao, MODULO, "total", ANO);
  const pessoal = totalDoModuloNoAno(plano, visao, "despesas-pessoal", "total", ANO);

  assert.ok(receita > 0);
  assert.ok(pessoal > 0);
  assert.notEqual(receita, pessoal, "módulos diferentes não podem gerar o mesmo total");
});

// ---------------------------------------------------------------------------
// Filiais
// ---------------------------------------------------------------------------

test("filial nova nasce zerada em planejado E em realizado", () => {
  // Regressão: o planejado vinha de um dicionário vazio (0) enquanto o realizado
  // era gerado por fórmula com fator default, então aparecia realizado contra
  // planejado zero.
  const base = planoBase();
  const plano = {
    ...base,
    filiais: [...base.filiais, { id: "nova", nome: "Filial Nova", manual: true, fator: 0 }],
  };
  const linhas = criarLinhasOrcamento(plano, visaoConfigurada(), MODULO, "nova", ANO);

  for (const linha of linhasDeMes(linhas)) {
    assert.equal(linha.planejado, 0, `planejado de ${linha.label}`);
    assert.equal(linha.realizado, 0, `realizado de ${linha.label}`);
    assert.equal(linha.anterior, 0, `ano anterior de ${linha.label}`);
  }
});

test("total das filiais é a soma das filiais individuais", () => {
  const plano = planoBase();
  const visao = visaoConfigurada();
  const total = totalDoModuloNoAno(plano, visao, MODULO, "total", ANO);
  const soma = plano.filiais.reduce(
    (acumulado, filial) => acumulado + totalDoModuloNoAno(plano, visao, MODULO, filial.id, ANO),
    0
  );

  assert.equal(total, soma);
});

test("excluir filial limpa as edições órfãs do plano", () => {
  // Regressão: as chaves ficavam no plano e ressuscitavam se a filial fosse
  // recriada com o mesmo id.
  const plano = {
    ...planoBase(),
    planejado: {
      [chavePlanejado(MODULO, "akr", ANO, 1)]: 100,
      [chavePlanejado(MODULO, "menhub", ANO, 1)]: 200,
      [chavePlanejado("custos-variaveis", "akr", ANO, 5)]: 300,
    },
  };

  const semAkr = removerDimensao(plano, "filiais", "akr");
  assert.deepEqual(Object.keys(semAkr.planejado), [chavePlanejado(MODULO, "menhub", ANO, 1)]);
  assert.ok(!semAkr.filiais.some((filial) => filial.id === "akr"));
});

test("excluir centro de custo não toca nas edições", () => {
  const plano = {
    ...planoBase(),
    planejado: { [chavePlanejado(MODULO, "akr", ANO, 1)]: 100 },
  };
  const proximo = removerDimensao(plano, "centros", "comercial");

  assert.equal(Object.keys(proximo.planejado).length, 1);
  assert.ok(!proximo.centros.some((centro) => centro.id === "comercial"));
});

// ---------------------------------------------------------------------------
// Edição e cálculo
// ---------------------------------------------------------------------------

test("edição manual entra no total do ano", () => {
  const plano = planoBase();
  const visao = visaoConfigurada();
  const chave = chavePlanejado(MODULO, "akr", ANO, 3);

  const semEdicao = totalDe(criarLinhasOrcamento(plano, visao, MODULO, "akr", ANO));
  const original = linhasDeMes(criarLinhasOrcamento(plano, visao, MODULO, "akr", ANO))[2].planejado;

  const editado = { ...plano, planejado: { ...plano.planejado, [chave]: 1234567 } };
  const comEdicao = totalDe(criarLinhasOrcamento(editado, visao, MODULO, "akr", ANO));

  assert.equal(comEdicao.planejado, semEdicao.planejado - original + 1234567);
});

test("edição de valor zero é respeitada e não cai de volta no gerador", () => {
  // `?? gerador` e não `|| gerador`: zerar uma célula é decisão do usuário.
  const plano = planoBase();
  const chave = chavePlanejado(MODULO, "akr", ANO, 5);
  const editado = { ...plano, planejado: { ...plano.planejado, [chave]: 0 } };

  const linha = linhasDeMes(criarLinhasOrcamento(editado, visaoConfigurada(), MODULO, "akr", ANO))[4];
  assert.equal(linha.planejado, 0);
});

test("a edição vale só para o módulo, a filial e o ano da chave", () => {
  const plano = planoBase();
  const visao = definirContasDoModulo(visaoConfigurada(), "custos-variaveis", ["3.1.9.01.001"]);
  const chave = chavePlanejado(MODULO, "akr", ANO, 1);
  const editado = { ...plano, planejado: { ...plano.planejado, [chave]: 999999 } };

  const outroModulo = linhasDeMes(
    criarLinhasOrcamento(editado, visao, "custos-variaveis", "akr", ANO)
  )[0].planejado;
  const outraFilial = linhasDeMes(
    criarLinhasOrcamento(editado, visao, MODULO, "menhub", ANO)
  )[0].planejado;
  const outroAno = linhasDeMes(criarLinhasOrcamento(editado, visao, MODULO, "akr", 2025))[0]
    .planejado;

  assert.notEqual(outroModulo, 999999);
  assert.notEqual(outraFilial, 999999);
  assert.notEqual(outroAno, 999999);
});

test("média divide pelos meses com dado, não por 12 fixo", () => {
  const linhas = criarLinhasOrcamento(planoBase(), visaoConfigurada(), MODULO, "total", ANO);
  const total = totalDe(linhas);
  const media = mediaDe(linhas);
  const meses = mesesComRealizado(ANO);

  assert.equal(media.planejado, total.planejado / 12);
  if (meses > 0 && meses < 12) {
    assert.equal(media.realizado, total.realizado / meses);
    assert.notEqual(media.realizado, total.realizado / 12);
  }
});
