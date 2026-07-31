import { strict as assert } from "node:assert";
import { test } from "node:test";

import { indexarContas } from "../src/dados/contas.js";
import {
  filiaisForaDoUso,
  indexarRealizado,
  somarRealizado,
  tipoDaConta,
} from "../src/dados/realizado.js";
import { SEM_CENTRO } from "../src/dados/visao.js";

const FILIAIS = [{ id: "000001" }, { id: "000008" }];

// O sinal vem do LX_GRUPO_CONTABIL da conta, não do tipo do módulo.
const catalogo = indexarContas([
  { codigo: "3.1.1.01.001", descricao: "COLEÇÃO", totalizaEm: null, sintetica: false, grupo: "R" },
  { codigo: "3.1.1.01.002", descricao: "SALDO", totalizaEm: null, sintetica: false, grupo: "R" },
  { codigo: "4.4.1.01", descricao: "SALÁRIOS", totalizaEm: null, sintetica: false, grupo: "DF" },
  { codigo: "4.5.2.01.001", descricao: "JUROS OBTIDOS", totalizaEm: null, sintetica: false, grupo: "R" },
  { codigo: "4.6.5.01.001", descricao: "INDENIZAÇÃO DE SEGUROS", totalizaEm: null, sintetica: false, grupo: "DF" },
]);

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
    catalogo,
    tipoPadrao: "receita",
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

test("o sinal vem do grupo da conta, não do módulo", () => {
  // Módulo de despesa pode conter conta de receita: "Outras despesas" tem juros
  // obtidos. Ler pelo tipo do módulo inverteria o sinal dessas contas.
  assert.equal(somar({ contas: ["4.4.1.01"], tipoPadrao: "receita" }), 2800, "DF é despesa");
  assert.equal(somar({ contas: ["3.1.1.01.001"], tipoPadrao: "despesa" }), 6150, "R é receita");
});

test("conta fora do catálogo cai no tipo do módulo", () => {
  const solto = indexarRealizado([
    { classificacao: "9.9", filial: "000001", centro: "002", mes: 1, debito: 300, credito: 0 },
  ]);
  assert.equal(somar({ indice: solto, contas: ["9.9"], tipoPadrao: "despesa" }), 300);
  assert.equal(somar({ indice: solto, contas: ["9.9"], tipoPadrao: "receita" }), -300);
});

test("inverter conserta conta classificada errada no ERP", () => {
  // 4.6.5.01 INDENIZAÇÃO DE SEGUROS é receita marcada como DF no cadastro.
  const seguros = indexarRealizado([
    { classificacao: "4.6.5.01.001", filial: "000001", centro: "002", mes: 1, debito: 0, credito: 500 },
  ]);
  const args = { indice: seguros, contas: ["4.6.5.01.001"], tipoPadrao: "despesa" };
  // Com a visão contábil 25 a correção conhecida entra sozinha.
  assert.equal(somar({ ...args, visaoContabil: "25" }), 500);
  // Sem ela, cai no grupo do ERP, que está errado.
  assert.equal(somar(args), -500);
  // E o usuário ainda pode definir à mão.
  assert.equal(somar({ ...args, sinais: { "4.6.5.01.001": "receita" } }), 500);
});

test("tipoDaConta segue as tres camadas, nesta ordem", () => {
  // 3. grupo do ERP
  assert.equal(tipoDaConta(catalogo, "3.1.1.01.001", "despesa"), "receita");
  assert.equal(tipoDaConta(catalogo, "4.4.1.01", "receita"), "despesa");
  // conta fora do catalogo cai no tipo do modulo
  assert.equal(tipoDaConta(catalogo, "nao-existe", "despesa"), "despesa");

  // 2. correcao conhecida ganha do grupo
  assert.equal(tipoDaConta(catalogo, "4.6.5.01.001", "despesa"), "despesa", "sem visao contabil");
  assert.equal(
    tipoDaConta(catalogo, "4.6.5.01.001", "despesa", { visaoContabil: "25" }),
    "receita"
  );
  // outra visao contabil nao herda a correcao da 25
  assert.equal(
    tipoDaConta(catalogo, "4.6.5.01.001", "despesa", { visaoContabil: "21" }),
    "despesa"
  );

  // 1. o que o usuario definiu ganha de tudo
  assert.equal(
    tipoDaConta(catalogo, "4.6.5.01.001", "despesa", {
      visaoContabil: "25",
      sinais: { "4.6.5.01.001": "despesa" },
    }),
    "despesa"
  );
  // valor invalido em sinais e ignorado
  assert.equal(
    tipoDaConta(catalogo, "4.4.1.01", "receita", { sinais: { "4.4.1.01": "xpto" } }),
    "despesa"
  );
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

// ---------------------------------------------------------------------------
// Filiais com movimento fora da configuração
// ---------------------------------------------------------------------------

test("índice registra as filiais com movimento", () => {
  assert.deepEqual([...indice.filiais].sort(), ["000001", "000008"]);
  assert.deepEqual([...indexarRealizado([]).filiais], []);
});

test("aponta filial com movimento que está fora das em uso", () => {
  // Sem esse aviso o total sai menor que o do ERP e parece erro de cálculo — foi
  // o que gerou a dúvida contra o Scoreplan.
  assert.deepEqual(filiaisForaDoUso(indice, [{ id: "000001" }]), ["000008"]);
  assert.deepEqual(filiaisForaDoUso(indice, FILIAIS), []);
  assert.deepEqual(filiaisForaDoUso(indice, []), ["000001", "000008"]);
});

test("considera também a filial que só tem movimento no ano anterior", () => {
  // Caso real: a 000004 fechou 2025 com 49.080,58 e não teve nada em 2026.
  // Olhando só o ano do plano, a diferença aparecia apenas na coluna comparativa,
  // sem nada na tela explicando.
  const doAnoAnterior = indexarRealizado([
    { classificacao: "3.1.1.01.001", filial: "000004", centro: "002", mes: 12, debito: 0, credito: 49080.58 },
  ]);
  assert.deepEqual(filiaisForaDoUso([indice, doAnoAnterior], FILIAIS), ["000004"]);
});

test("filiais fora do uso não quebra com índice ausente", () => {
  assert.deepEqual(filiaisForaDoUso(null, FILIAIS), []);
  assert.deepEqual(filiaisForaDoUso([null, undefined], FILIAIS), []);
});

// ---------------------------------------------------------------------------
// Realizado recortado por conta de receita
//
// O razão não diz de qual receita é uma devolução: a atribuição vem do centro
// de custo (020 é e-commerce, o resto é coleção). É a regra do Scoreplan, e é
// contra ele que os números são conferidos.
// ---------------------------------------------------------------------------

const COLECAO = "3.1.1.01.001";
const ECOMMERCE = "3.1.1.01.004";
const DEDUCAO = "3.1.2.01.001";

const comReceita = indexarRealizado(
  [
    { classificacao: DEDUCAO, filial: "000001", centro: "001", mes: 1, debito: 700, credito: 0 },
    { classificacao: DEDUCAO, filial: "000001", centro: "017", mes: 1, debito: 100, credito: 0 },
    { classificacao: DEDUCAO, filial: "000001", centro: "020", mes: 1, debito: 200, credito: 0 },
  ],
  "25"
);

const somarDeducao = (extra) =>
  somarRealizado({
    indice: comReceita,
    contas: [DEDUCAO],
    filiais: [{ id: "000001" }],
    mes: 1,
    tipoPadrao: "despesa",
    visaoContabil: "25",
    ...extra,
  });

test("centro 020 vai para e-commerce, o resto para coleção", () => {
  assert.equal(somarDeducao({ receitas: [COLECAO] }), 800);
  assert.equal(somarDeducao({ receitas: [ECOMMERCE] }), 200);
});

test("as receitas somadas dão a conta contábil inteira", () => {
  assert.equal(somarDeducao({ receitas: [COLECAO, ECOMMERCE] }), 1000);
  assert.equal(somarDeducao({}), 1000);
});

test("sem receita escolhida o realizado é da conta inteira", () => {
  // Vazio e ausente valem o mesmo: "todas".
  assert.equal(somarDeducao({ receitas: [] }), 1000);
  assert.equal(somarDeducao({ receitas: undefined }), 1000);
});

test("receita sem movimento atribuído fica zerada", () => {
  assert.equal(somarDeducao({ receitas: ["3.1.1.01.002"] }), 0);
});

test("com centro escolhido a receita já está determinada", () => {
  // O centro 001 é coleção: pedir e-commerce junto não pode inventar valor.
  assert.equal(somarDeducao({ centroId: "001", receitas: [COLECAO] }), 700);
  assert.equal(somarDeducao({ centroId: "001", receitas: [ECOMMERCE] }), 0);
  assert.equal(somarDeducao({ centroId: "020", receitas: [ECOMMERCE] }), 200);
});

test("sem visão contábil conhecida não há índice por receita", () => {
  const semRegra = indexarRealizado(
    [{ classificacao: DEDUCAO, filial: "000001", centro: "001", mes: 1, debito: 700, credito: 0 }],
    "99"
  );
  assert.equal(semRegra.porReceita.size, 0);
});
