import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  purgarFilialDosPlanos,
  totalPlanejadoNoAno,
} from "../src/dados/plano.js";
import { indexarContas } from "../src/dados/contas.js";
import { indexarRealizado } from "../src/dados/realizado.js";
import { criarVisao, definirContasDoModulo } from "../src/dados/visao.js";
import { mesesComRealizado } from "../src/dados/calendario.js";

const ANO = 2025;
const MODULO = "receita-vendas";

// Grupo contábil importa: cada módulo só soma as contas do LX_GRUPO_CONTABIL dele.
const catalogo = indexarContas([
  { codigo: "3.1.1.1", descricao: "VENDA DE MERCADORIA", totalizaEm: "3.1.1", sintetica: true, grupo: "R" },
  { codigo: "3.1.1.1.01", descricao: "BAZAR", totalizaEm: "3.1.1.1", sintetica: false, grupo: "R" },
  { codigo: "3.1.1.1.02", descricao: "COLEÇÃO", totalizaEm: "3.1.1.1", sintetica: false, grupo: "R" },
  { codigo: "4.1.2.01", descricao: "CMV", totalizaEm: "4.1", sintetica: true, grupo: "DV" },
  { codigo: "4.1.2.01.001", descricao: "CMV COLEÇÃO", totalizaEm: "4.1.2.01", sintetica: false, grupo: "DV" },
]);

const FILIAIS = [{ id: "000001", nome: "KING&JOE" }, { id: "000008", nome: "E-COMMERCE" }];

const visao = definirContasDoModulo(criarVisao("v1", "DRE 2025"), MODULO, ["3.1.1.1.02"]);

const realizado = indexarRealizado([
  { classificacao: "3.1.1.1.02", filial: "000001", mes: 1, debito: 0, credito: 1000 },
  { classificacao: "3.1.1.1.02", filial: "000008", mes: 1, debito: 0, credito: 500 },
  { classificacao: "3.1.1.1.02", filial: "000001", mes: 2, debito: 0, credito: 2000 },
  { classificacao: "4.1.2.01.001", filial: "000001", mes: 1, debito: 1500, credito: 0 },
]);

const anterior = indexarRealizado([
  { classificacao: "3.1.1.1.02", filial: "000001", mes: 1, debito: 0, credito: 800 },
]);

const plano = (planejado = {}) => ({
  ...criarPlano("p1", "Oficial", 2024, 2026, "v1"),
  planejado,
});

const linhas = (extra) =>
  criarLinhasOrcamento({
    plano: plano(),
    visao,
    filiais: FILIAIS,
    catalogo,
    realizado,
    realizadoAnterior: anterior,
    moduloId: MODULO,
    filialId: "total",
    ano: ANO,
    ...extra,
  });

const mes = (lista, numero) => lista.find((linha) => linha.id === numero);
const totalDe = (lista) => lista.find((linha) => linha.id === "total");
const mediaDe = (lista) => lista.find((linha) => linha.id === "media");

// ---------------------------------------------------------------------------
// Planejado: só o que foi digitado
// ---------------------------------------------------------------------------

test("célula sem valor digitado é zero, não número gerado", () => {
  // O mock determinístico foi removido: não existe planejamento que ninguém fez.
  const lista = linhas();
  assert.equal(totalDe(lista).planejado, 0);
  lista.forEach((linha) => assert.equal(linha.planejado, 0, `planejado de ${linha.label}`));
});

test("valor digitado aparece no mês e no total", () => {
  const digitado = { [chavePlanejado(MODULO, "000001", ANO, 3)]: 12345 };
  const lista = linhas({ plano: plano(digitado) });

  assert.equal(mes(lista, 3).planejado, 12345);
  assert.equal(mes(lista, 4).planejado, 0);
  assert.equal(totalDe(lista).planejado, 12345);
});

test("planejado de 'total' soma as filiais", () => {
  const digitado = {
    [chavePlanejado(MODULO, "000001", ANO, 1)]: 100,
    [chavePlanejado(MODULO, "000008", ANO, 1)]: 25,
  };
  const lista = linhas({ plano: plano(digitado) });
  assert.equal(mes(lista, 1).planejado, 125);
});

test("edição vale só para o módulo, a filial e o ano da chave", () => {
  const digitado = { [chavePlanejado(MODULO, "000001", ANO, 1)]: 999 };
  const p = plano(digitado);

  const outraFilial = mes(linhas({ plano: p, filialId: "000008" }), 1).planejado;
  const outroAno = mes(linhas({ plano: p, filialId: "000001", ano: 2024 }), 1).planejado;
  const outroModulo = mes(
    linhas({
      plano: p,
      visao: definirContasDoModulo(visao, "custos-variaveis", ["3.1.1.1.02"]),
      moduloId: "custos-variaveis",
      filialId: "000001",
    }),
    1
  ).planejado;

  assert.equal(outraFilial, 0);
  assert.equal(outroAno, 0);
  assert.equal(outroModulo, 0);
});

test("totalPlanejadoNoAno soma os doze meses", () => {
  const digitado = {
    [chavePlanejado(MODULO, "000001", ANO, 1)]: 10,
    [chavePlanejado(MODULO, "000001", ANO, 12)]: 90,
  };
  const total = totalPlanejadoNoAno({
    plano: plano(digitado),
    visao,
    filiais: FILIAIS,
    moduloId: MODULO,
    filialId: "total",
    ano: ANO,
  });
  assert.equal(total, 100);
});

// ---------------------------------------------------------------------------
// Realizado: vem do ERP
// ---------------------------------------------------------------------------

test("realizado vem do índice do ERP, por filial e mês", () => {
  const lista = linhas();
  assert.equal(mes(lista, 1).realizado, 1500);
  assert.equal(mes(lista, 2).realizado, 2000);
  assert.equal(mes(lista, 3).realizado, 0);
  assert.equal(totalDe(lista).realizado, 3500);
});

test("ano anterior usa o índice do ano anterior", () => {
  const lista = linhas();
  assert.equal(mes(lista, 1).anterior, 800);
  assert.equal(mes(lista, 1).variacao, 700);
  assert.equal(mes(lista, 1).variacaoPercentual, (700 / 800) * 100);
});

test("realizado ausente não quebra a tabela", () => {
  const lista = linhas({ realizado: undefined, realizadoAnterior: undefined });
  assert.equal(totalDe(lista).realizado, 0);
  assert.equal(totalDe(lista).anterior, 0);
  assert.equal(totalDe(lista).variacaoPercentual, 0);
});

test("módulo sem conta na visão zera todas as colunas", () => {
  const lista = linhas({ visao: criarVisao("v1", "Vazia") });
  assert.equal(lista.length, 14, "12 meses + total + média");
  lista.forEach((linha) => {
    assert.equal(linha.planejado, 0);
    assert.equal(linha.realizado, 0);
    assert.equal(linha.anterior, 0);
  });
});

test("módulo inexistente devolve zeros em vez de estourar", () => {
  assert.equal(totalDe(linhas({ moduloId: "nao-existe" })).planejado, 0);
});

test("visão ausente devolve zeros em vez de estourar", () => {
  assert.equal(totalDe(linhas({ visao: null })).realizado, 0);
});

test("filial fora do cadastro do ERP devolve zeros", () => {
  assert.equal(totalDe(linhas({ filialId: "999999" })).realizado, 0);
});

test("módulo de despesa lê o realizado invertido", () => {
  // custos-variaveis é DV; a conta 4.1.2.01.001 tem débito 1500.
  const visaoDespesa = definirContasDoModulo(criarVisao("v1", "X"), "custos-variaveis", [
    "4.1.2.01.001",
  ]);
  const lista = linhas({ visao: visaoDespesa, moduloId: "custos-variaveis" });
  // Despesa é débito − crédito, e volta positiva.
  assert.equal(mes(lista, 1).realizado, 1500);
});

test("módulo só soma contas do seu grupo contábil", () => {
  // Uma conta R marcada num módulo DV não entra: o filtro do módulo é o
  // LX_GRUPO_CONTABIL, não a vontade de quem marcou.
  const visaoErrada = definirContasDoModulo(criarVisao("v1", "X"), "custos-variaveis", [
    "3.1.1.1.02",
  ]);
  const lista = linhas({ visao: visaoErrada, moduloId: "custos-variaveis" });
  assert.equal(mes(lista, 1).realizado, 0);
});

test("conta de outro grupo salva na visão é descartada na soma", () => {
  // Defesa contra visão gravada antes de o filtro existir, ou com o grupo da
  // conta mudado no ERP depois: 4.1.2.01 e 4.1.2.01.001 são DV e não podem entrar
  // num módulo DF, mesmo estando na lista.
  const visaoDf = definirContasDoModulo(criarVisao("v1", "X"), "despesas-operacionais", [
    "4.1.2.01",
    "4.1.2.01.001",
  ]);
  const lista = linhas({ visao: visaoDf, moduloId: "despesas-operacionais" });
  assert.equal(mes(lista, 1).realizado, 0);
});

test("média divide pelos meses com dado, não por 12 fixo", () => {
  const lista = linhas();
  const total = totalDe(lista);
  const media = mediaDe(lista);
  const comDado = mesesComRealizado(ANO);

  assert.equal(media.planejado, total.planejado / 12);
  if (comDado > 0 && comDado < 12) {
    assert.equal(media.realizado, total.realizado / comDado);
  }
});

// ---------------------------------------------------------------------------
// Filial removida do ERP
// ---------------------------------------------------------------------------

test("purgar filial limpa as edições dela em todos os planos", () => {
  const planos = [
    plano({
      [chavePlanejado(MODULO, "000001", ANO, 1)]: 100,
      [chavePlanejado(MODULO, "000008", ANO, 1)]: 200,
    }),
    { ...plano({ [chavePlanejado(MODULO, "000001", ANO, 5)]: 300 }), id: "p2" },
  ];

  const [p1, p2] = purgarFilialDosPlanos(planos, "000001");
  assert.deepEqual(Object.keys(p1.planejado), [chavePlanejado(MODULO, "000008", ANO, 1)]);
  assert.deepEqual(Object.keys(p2.planejado), []);
});

test("purgar filial sem edições devolve o mesmo objeto", () => {
  // Evita recriar o plano (e disparar re-render) quando nada mudou.
  const planos = [plano()];
  assert.equal(purgarFilialDosPlanos(planos, "000001")[0], planos[0]);
});
