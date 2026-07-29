import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  canaisVisiveis,
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  removerDimensao,
} from "../src/dados/plano.js";
import { mesesComRealizado } from "../src/dados/calendario.js";

const ANO = 2026;

function planoBase() {
  return criarPlano("teste", "Plano de teste", 2024, 2026);
}

function comFilialManual(plano, id = "filial-nova") {
  return { ...plano, filiais: [...plano.filiais, { id, nome: "Filial Nova", manual: true, fator: 0 }] };
}

function comCanalManual(plano, id = "canal-novo") {
  return {
    ...plano,
    canais: [
      ...plano.canais,
      { id, nome: "Canal Novo", manual: true, contas: [], bases: { vendas: 0, operacionais: 0 } },
    ],
  };
}

const linhasDeMes = (linhas) => linhas.filter((linha) => typeof linha.id === "number");
const totalDe = (linhas) => linhas.find((linha) => linha.id === "total");
const mediaDe = (linhas) => linhas.find((linha) => linha.id === "media");

test("filial nova nasce zerada em planejado E em realizado", () => {
  // Regressão: o planejado vinha do dicionário (vazio -> 0) mas o realizado era
  // gerado por fórmula com fator default 0,58, então aparecia realizado contra
  // planejado zero.
  const plano = comFilialManual(planoBase());
  const linhas = criarLinhasOrcamento(plano, "vendas", "filial-nova", "total", ANO);

  for (const linha of linhasDeMes(linhas)) {
    assert.equal(linha.planejado, 0, `planejado de ${linha.label}`);
    assert.equal(linha.realizado, 0, `realizado de ${linha.label}`);
    assert.equal(linha.anterior, 0, `ano anterior de ${linha.label}`);
  }
});

test("canal novo nasce zerado nos três indicadores", () => {
  const plano = comCanalManual(planoBase());
  const linhas = criarLinhasOrcamento(plano, "vendas", "total", "canal-novo", ANO);
  const total = totalDe(linhas);

  assert.equal(total.planejado, 0);
  assert.equal(total.realizado, 0);
  assert.equal(total.anterior, 0);
});

test("canal criado na tela não some com o filtro de ocultar", () => {
  // Regressão: canal novo é zerado, e o filtro (ligado por padrão) o escondia
  // logo depois do cadastro.
  const plano = comCanalManual(planoBase());
  const visiveis = canaisVisiveis(plano, "vendas", "total", ANO, true);

  assert.ok(visiveis.some((canal) => canal.id === "canal-novo"));
  // Canal de seed zerado continua sendo escondido, como antes.
  assert.ok(!visiveis.some((canal) => canal.id === "mercado-externo"));
});

test("edição manual entra no total do ano", () => {
  const plano = planoBase();
  const chave = chavePlanejado("vendas", "akr", "atacado", ANO, 3);
  const semEdicao = totalDe(criarLinhasOrcamento(plano, "vendas", "akr", "atacado", ANO));

  const original = linhasDeMes(criarLinhasOrcamento(plano, "vendas", "akr", "atacado", ANO))[2].planejado;
  const editado = { ...plano, planejado: { ...plano.planejado, [chave]: 1234567 } };
  const comEdicao = totalDe(criarLinhasOrcamento(editado, "vendas", "akr", "atacado", ANO));

  assert.equal(comEdicao.planejado, semEdicao.planejado - original + 1234567);
});

test("edição de valor zero é respeitada e não cai de volta no gerador", () => {
  // `?? gerador` e não `|| gerador`: zerar uma célula é uma decisão do usuário.
  const plano = planoBase();
  const chave = chavePlanejado("vendas", "akr", "atacado", ANO, 5);
  const editado = { ...plano, planejado: { ...plano.planejado, [chave]: 0 } };

  const linha = linhasDeMes(criarLinhasOrcamento(editado, "vendas", "akr", "atacado", ANO))[4];
  assert.equal(linha.planejado, 0);
});

test("média divide pelos meses com dado, não por 12 fixo", () => {
  const plano = planoBase();
  const linhas = criarLinhasOrcamento(plano, "vendas", "total", "total", ANO);
  const total = totalDe(linhas);
  const media = mediaDe(linhas);
  const meses = mesesComRealizado(ANO);

  assert.equal(media.planejado, total.planejado / 12);
  if (meses > 0 && meses < 12) {
    assert.equal(media.realizado, total.realizado / meses);
    assert.notEqual(media.realizado, total.realizado / 12);
  }
});

test("excluir dimensão limpa as edições órfãs do plano", () => {
  // Regressão: as chaves ficavam no plano e ressuscitavam se alguém recriasse a
  // dimensão com o mesmo id.
  const plano = {
    ...planoBase(),
    planejado: {
      [chavePlanejado("vendas", "akr", "atacado", ANO, 1)]: 100,
      [chavePlanejado("vendas", "menhub", "atacado", ANO, 1)]: 200,
    },
    pctPlanejado: {
      "akr|atacado|impostos|2026|1": 5,
      "menhub|atacado|impostos|2026|1": 7,
    },
  };

  const semAkr = removerDimensao(plano, "filiais", "akr");
  assert.deepEqual(Object.keys(semAkr.planejado), [chavePlanejado("vendas", "menhub", "atacado", ANO, 1)]);
  assert.deepEqual(Object.keys(semAkr.pctPlanejado), ["menhub|atacado|impostos|2026|1"]);
  assert.ok(!semAkr.filiais.some((filial) => filial.id === "akr"));

  const semAtacado = removerDimensao(plano, "canais", "atacado");
  assert.equal(Object.keys(semAtacado.planejado).length, 0);
  assert.equal(Object.keys(semAtacado.pctPlanejado).length, 0);

  const semImpostos = removerDimensao(plano, "deducao", "impostos");
  assert.equal(Object.keys(semImpostos.planejado).length, 2, "dedução não afeta o planejado");
  assert.equal(Object.keys(semImpostos.pctPlanejado).length, 0);
});

test("total das filiais é a soma das filiais individuais", () => {
  const plano = planoBase();
  const total = totalDe(criarLinhasOrcamento(plano, "vendas", "total", "atacado", ANO)).planejado;
  const soma = plano.filiais.reduce(
    (acumulado, filial) =>
      acumulado + totalDe(criarLinhasOrcamento(plano, "vendas", filial.id, "atacado", ANO)).planejado,
    0
  );

  assert.equal(total, soma);
});
