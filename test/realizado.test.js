import { strict as assert } from "node:assert";
import { test } from "node:test";

import { indexarRealizado, somarRealizado } from "../src/dados/realizado.js";
import { SEM_CENTRO } from "../src/dados/visao.js";

const FILIAIS = [{ id: "000001" }, { id: "000008" }];

// Recorte no formato de /api/realizado: classificação × filial × centro × mês.
const indice = indexarRealizado([
  { classificacao: "3.1.1.01.001", filial: "000001", centro: "002", mes: 1, debito: 100, credito: 5000 },
  { classificacao: "3.1.1.01.001", filial: "000001", centro: "008", mes: 1, debito: 0, credito: 1000 },
  { classificacao: "3.1.1.01.001", filial: "000008", centro: "002", mes: 1, debito: 0, credito: 250 },
  { classificacao: "3.1.1.01.002", filial: "000001", centro: "002", mes: 1, debito: 0, credito: 700 },
  { classificacao: "4.4.1.01", filial: "000001", centro: "002", mes: 1, debito: 3000, credito: 200 },
]);

const somar = (extra) =>
  somarRealizado({
    indice,
    contas: ["3.1.1.01.001"],
    filiais: FILIAIS,
    centroId: SEM_CENTRO,
    mes: 1,
    tipo: "receita",
    ...extra,
  });

test("sem centro escolhido soma todos os centros", () => {
  // 000001: (5000−100) + 1000 = 5900 · 000008: 250
  assert.equal(somar(), 6150);
});

test("com centro escolhido soma só aquele centro", () => {
  assert.equal(somar({ centroId: "002" }), 4900 + 250);
  assert.equal(somar({ centroId: "008" }), 1000);
});

test("centro sem movimento devolve zero", () => {
  assert.equal(somar({ centroId: "999" }), 0);
});

test("receita é crédito menos débito; despesa inverte", () => {
  // Planejado é sempre positivo; devolver a despesa positiva deixa a variação
  // significar a mesma coisa nos dois tipos de módulo.
  assert.equal(somar({ contas: ["4.4.1.01"], tipo: "despesa" }), 2800);
  assert.equal(somar({ contas: ["4.4.1.01"], tipo: "receita" }), -2800);
});

test("filial específica soma só ela", () => {
  assert.equal(somar({ filiais: [{ id: "000008" }] }), 250);
});

test("várias contas somam juntas", () => {
  assert.equal(somar({ contas: ["3.1.1.01.001", "3.1.1.01.002"] }), 6150 + 700);
});

test("mês sem movimento é zero, não erro", () => {
  assert.equal(somar({ mes: 7 }), 0);
});

test("índice vazio ou ausente devolve zero", () => {
  assert.equal(somar({ indice: indexarRealizado([]) }), 0);
  assert.equal(somar({ indice: indexarRealizado(undefined) }), 0);
  assert.equal(somar({ indice: null }), 0);
});

test("sem conta ou sem filial o total é zero", () => {
  assert.equal(somar({ contas: [] }), 0);
  assert.equal(somar({ filiais: [] }), 0);
});

test("linhas repetidas da mesma chave são acumuladas", () => {
  // A consulta agrupa, mas o índice não pode depender disso.
  const duplicado = indexarRealizado([
    { classificacao: "X", filial: "000001", centro: "002", mes: 1, debito: 0, credito: 100 },
    { classificacao: "X", filial: "000001", centro: "002", mes: 1, debito: 0, credito: 400 },
  ]);
  assert.equal(somar({ indice: duplicado, contas: ["X"], centroId: "002" }), 500);
});

test("valor em texto (numeric do driver) é somado como número", () => {
  const comTexto = indexarRealizado([
    { classificacao: "X", filial: "000001", centro: "002", mes: 1, debito: "100", credito: "5000" },
  ]);
  assert.equal(somar({ indice: comTexto, contas: ["X"] }), 4900);
});

test("linha sem centro entra como sem centro", () => {
  const semCentro = indexarRealizado([
    { classificacao: "X", filial: "000001", mes: 1, debito: 0, credito: 300 },
  ]);
  assert.equal(somar({ indice: semCentro, contas: ["X"] }), 300);
  assert.equal(somar({ indice: semCentro, contas: ["X"], centroId: SEM_CENTRO }), 300);
});
