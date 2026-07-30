import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  purgarFilialDosPlanos,
  totalDoModuloNoAno,
} from "../src/dados/plano.js";
import { configuracaoInicial } from "../src/dados/configuracao.js";
import { criarVisao, definirContasDoModulo } from "../src/dados/visao.js";
import { mesesComRealizado } from "../src/dados/calendario.js";

const ANO = 2026;
const MODULO = "receita-vendas";

const FILIAIS = configuracaoInicial().filiais;

function visaoConfigurada() {
  return definirContasDoModulo(criarVisao("v1", "DRE 2025"), MODULO, [
    "3.1.1.01.001",
    "3.1.1.01.002",
  ]);
}

function planoBase(visaoId = "v1") {
  return criarPlano("teste", "Plano de teste", 2024, 2026, visaoId);
}

// Açúcar para não repetir o objeto de argumentos em cada caso.
const linhas = (extra) =>
  criarLinhasOrcamento({
    plano: planoBase(),
    visao: visaoConfigurada(),
    filiais: FILIAIS,
    moduloId: MODULO,
    filialId: "total",
    ano: ANO,
    ...extra,
  });

const total = (extra) =>
  totalDoModuloNoAno({
    plano: planoBase(),
    visao: visaoConfigurada(),
    filiais: FILIAIS,
    moduloId: MODULO,
    filialId: "total",
    ano: ANO,
    ...extra,
  });

const linhasDeMes = (lista) => lista.filter((linha) => typeof linha.id === "number");
const totalDe = (lista) => lista.find((linha) => linha.id === "total");
const mediaDe = (lista) => lista.find((linha) => linha.id === "media");

// ---------------------------------------------------------------------------
// Visão x orçamento
// ---------------------------------------------------------------------------

test("módulo sem contas na visão fica zerado", () => {
  // Zerar é honesto: sem conta vinculada não há o que somar. O contrário seria
  // exibir número gerado para um módulo que o usuário nunca configurou.
  const lista = linhas({ visao: criarVisao("v1", "Vazia") });

  assert.equal(lista.length, 14, "12 meses + total + média");
  for (const linha of lista) {
    assert.equal(linha.planejado, 0, `planejado de ${linha.label}`);
    assert.equal(linha.realizado, 0, `realizado de ${linha.label}`);
    assert.equal(linha.anterior, 0, `ano anterior de ${linha.label}`);
  }
});

test("módulo com contas na visão produz valores", () => {
  const resumo = totalDe(linhas());
  assert.ok(resumo.planejado > 0);
  assert.ok(resumo.realizado > 0);
});

test("módulo inexistente não quebra e devolve zeros", () => {
  assert.equal(totalDe(linhas({ moduloId: "nao-existe" })).planejado, 0);
});

test("visão ausente devolve zeros em vez de estourar", () => {
  assert.equal(totalDe(linhas({ visao: null })).planejado, 0);
});

test("sem filial configurada o orçamento é zero, não erro", () => {
  // Configurações é global; se estiver vazia não há filial para somar.
  assert.equal(totalDe(linhas({ filiais: [] })).planejado, 0);
  assert.equal(totalDe(linhas({ filiais: undefined })).planejado, 0);
});

test("cada módulo configurado tem seu próprio valor", () => {
  const visao = definirContasDoModulo(visaoConfigurada(), "despesas-pessoal", ["3.1.9.01.001"]);
  const receita = total({ visao });
  const pessoal = total({ visao, moduloId: "despesas-pessoal" });

  assert.ok(receita > 0);
  assert.ok(pessoal > 0);
  assert.notEqual(receita, pessoal, "módulos diferentes não podem gerar o mesmo total");
});

// ---------------------------------------------------------------------------
// Filiais (configuração global)
// ---------------------------------------------------------------------------

test("filial nova nasce zerada em planejado E em realizado", () => {
  // Regressão: o planejado vinha de um dicionário vazio (0) enquanto o realizado
  // era gerado por fórmula com fator default, então aparecia realizado contra
  // planejado zero.
  const nova = { id: "nova", nome: "Filial Nova", manual: true, fator: 0 };
  const lista = linhas({ filiais: [...FILIAIS, nova], filialId: "nova" });

  for (const linha of linhasDeMes(lista)) {
    assert.equal(linha.planejado, 0, `planejado de ${linha.label}`);
    assert.equal(linha.realizado, 0, `realizado de ${linha.label}`);
    assert.equal(linha.anterior, 0, `ano anterior de ${linha.label}`);
  }
});

test("filial inexistente na configuração devolve zero", () => {
  assert.equal(totalDe(linhas({ filialId: "nao-existe" })).planejado, 0);
});

test("total das filiais é a soma das filiais individuais", () => {
  const soma = FILIAIS.reduce(
    (acumulado, filial) => acumulado + total({ filialId: filial.id }),
    0
  );
  assert.equal(total(), soma);
});

test("excluir filial limpa as edições dela em TODOS os planos", () => {
  // Filial é global: purgar só o plano aberto deixaria chaves órfãs nos outros,
  // que ressuscitariam se a filial fosse recriada com o mesmo id.
  const planos = [
    {
      ...criarPlano("p1", "Um", 2024, 2026, "v1"),
      planejado: {
        [chavePlanejado(MODULO, "akr", ANO, 1)]: 100,
        [chavePlanejado(MODULO, "menhub", ANO, 1)]: 200,
      },
    },
    {
      ...criarPlano("p2", "Dois", 2024, 2026, "v1"),
      planejado: {
        [chavePlanejado("custos-variaveis", "akr", ANO, 5)]: 300,
        [chavePlanejado("custos-variaveis", "loja", ANO, 5)]: 400,
      },
    },
  ];

  const [p1, p2] = purgarFilialDosPlanos(planos, "akr");
  assert.deepEqual(Object.keys(p1.planejado), [chavePlanejado(MODULO, "menhub", ANO, 1)]);
  assert.deepEqual(Object.keys(p2.planejado), [chavePlanejado("custos-variaveis", "loja", ANO, 5)]);
});

test("purgar filial sem edições devolve o mesmo objeto", () => {
  // Evita recriar o plano (e disparar re-render) quando nada mudou.
  const planos = [criarPlano("p1", "Um", 2024, 2026, "v1")];
  const proximo = purgarFilialDosPlanos(planos, "akr");
  assert.equal(proximo[0], planos[0]);
});

// ---------------------------------------------------------------------------
// Edição e cálculo
// ---------------------------------------------------------------------------

test("edição manual entra no total do ano", () => {
  const plano = planoBase();
  const chave = chavePlanejado(MODULO, "akr", ANO, 3);

  const semEdicao = totalDe(linhas({ filialId: "akr" })).planejado;
  const original = linhasDeMes(linhas({ filialId: "akr" }))[2].planejado;

  const editado = { ...plano, planejado: { ...plano.planejado, [chave]: 1234567 } };
  const comEdicao = totalDe(linhas({ plano: editado, filialId: "akr" })).planejado;

  assert.equal(comEdicao, semEdicao - original + 1234567);
});

test("edição de valor zero é respeitada e não cai de volta no gerador", () => {
  // `?? gerador` e não `|| gerador`: zerar uma célula é decisão do usuário.
  const chave = chavePlanejado(MODULO, "akr", ANO, 5);
  const editado = { ...planoBase(), planejado: { [chave]: 0 } };

  const linha = linhasDeMes(linhas({ plano: editado, filialId: "akr" }))[4];
  assert.equal(linha.planejado, 0);
});

test("a edição vale só para o módulo, a filial e o ano da chave", () => {
  const visao = definirContasDoModulo(visaoConfigurada(), "custos-variaveis", ["3.1.9.01.001"]);
  const chave = chavePlanejado(MODULO, "akr", ANO, 1);
  const plano = { ...planoBase(), planejado: { [chave]: 999999 } };

  const outroModulo = linhasDeMes(
    linhas({ plano, visao, moduloId: "custos-variaveis", filialId: "akr" })
  )[0].planejado;
  const outraFilial = linhasDeMes(linhas({ plano, visao, filialId: "menhub" }))[0].planejado;
  const outroAno = linhasDeMes(linhas({ plano, visao, filialId: "akr", ano: 2025 }))[0].planejado;

  assert.notEqual(outroModulo, 999999);
  assert.notEqual(outraFilial, 999999);
  assert.notEqual(outroAno, 999999);
});

test("média divide pelos meses com dado, não por 12 fixo", () => {
  const lista = linhas();
  const resumo = totalDe(lista);
  const media = mediaDe(lista);
  const meses = mesesComRealizado(ANO);

  assert.equal(media.planejado, resumo.planejado / 12);
  if (meses > 0 && meses < 12) {
    assert.equal(media.realizado, resumo.realizado / meses);
    assert.notEqual(media.realizado, resumo.realizado / 12);
  }
});
