import assert from "node:assert/strict";
import test from "node:test";

import { MODULOS } from "../src/dados/modulos.js";
import {
  EDITA,
  NADA,
  TUDO,
  VE,
  aplicarNivelAosModulos,
  alternarCentroNaArvore,
  alternarFilialNaArvore,
  descreverAreas,
  gerarConcessoes,
  gerarConcessoesDeModulos,
  lerAreas,
  lerModulos,
  matrizVazia,
  nosDoTerritorio,
  territorioIrrestrito,
} from "../src/dados/territorio.js";

const RECEITA = "receita-vendas";
const DEDUCOES = "deducoes-vendas";

const matrizDe = (pares) => ({ ...matrizVazia(), ...pares });

test("sem concessão nenhuma, não há área", () => {
  assert.deepEqual(lerAreas([]), []);
});

test("um lugar e dois módulos viram uma área", () => {
  const areas = lerAreas([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
    { modulo: DEDUCOES, filial: "000001", centro: "020", podeEditar: false },
  ]);

  assert.equal(areas.length, 1);
  assert.deepEqual(areas[0].territorio, [{ filial: "000001", centro: "020" }]);
  assert.equal(areas[0].matriz[RECEITA], EDITA);
  assert.equal(areas[0].matriz[DEDUCOES], VE);
  assert.equal(areas[0].matriz["outras-despesas"], NADA);
});

test("concessão sem módulo vale para todos", () => {
  const [area] = lerAreas([{ modulo: null, filial: "000025", centro: null, podeEditar: true }]);
  assert.equal(
    MODULOS.every((modulo) => area.matriz[modulo.id] === EDITA),
    true
  );
});

test("vale a mais permissiva dentro do mesmo lugar", () => {
  const [area] = lerAreas([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: false },
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
  ]);
  assert.equal(area.matriz[RECEITA], EDITA);
});

// O caso que motivou as áreas: poder diferente por filial.
test("edita numa filial e só vê na outra dá DUAS áreas", () => {
  const areas = lerAreas([
    { modulo: null, filial: "000001", centro: null, podeEditar: true },
    { modulo: null, filial: "000025", centro: null, podeEditar: false },
  ]);

  assert.equal(areas.length, 2);
  const editando = areas.find((a) => a.matriz[RECEITA] === EDITA);
  const olhando = areas.find((a) => a.matriz[RECEITA] === VE);
  assert.deepEqual(editando.territorio, [{ filial: "000001", centro: null }]);
  assert.deepEqual(olhando.territorio, [{ filial: "000025", centro: null }]);
});

test("lugares com a mesma matriz se juntam numa área só", () => {
  const areas = lerAreas([
    { modulo: RECEITA, filial: "000001", centro: null, podeEditar: false },
    { modulo: RECEITA, filial: "000025", centro: null, podeEditar: false },
    { modulo: RECEITA, filial: "000011", centro: null, podeEditar: false },
  ]);
  assert.equal(areas.length, 1, "três filiais, um jeito de agir");
  assert.equal(areas[0].territorio.length, 3);
});

test("gerar: um módulo em dois lugares dá duas concessões", () => {
  const concessoes = gerarConcessoes([
    {
      territorio: [
        { filial: "000001", centro: "020" },
        { filial: "000001", centro: "001" },
      ],
      matriz: matrizDe({ [RECEITA]: EDITA }),
    },
  ]);
  assert.equal(concessoes.length, 2);
  assert.equal(concessoes.every((c) => c.modulo === RECEITA && c.podeEditar), true);
});

test("gerar: matriz toda no mesmo estado colapsa em módulo nulo", () => {
  const matriz = matrizVazia();
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = VE;
  });

  const concessoes = gerarConcessoes([{ territorio: [{ filial: null, centro: null }], matriz }]);
  assert.equal(concessoes.length, 1, "uma linha só, não oito");
  assert.equal(concessoes[0].modulo, null);
  assert.equal(concessoes[0].podeEditar, false);
});

test("gerar: área sem módulo marcado não concede nada", () => {
  assert.deepEqual(
    gerarConcessoes([{ territorio: [{ filial: "000001", centro: null }], matriz: matrizVazia() }]),
    []
  );
});

// Áreas sobrepostas colidiriam na chave (login, módulo, filial, centro).
test("gerar: no mesmo lugar, a mais permissiva prevalece", () => {
  const concessoes = gerarConcessoes([
    { territorio: [{ filial: "000001", centro: null }], matriz: matrizDe({ [RECEITA]: EDITA }) },
    { territorio: [{ filial: "000001", centro: null }], matriz: matrizDe({ [RECEITA]: VE }) },
  ]);
  assert.equal(concessoes.length, 1);
  assert.equal(concessoes[0].podeEditar, true);
});

// A garantia que sustenta trocar a tela.
test("ida e volta preserva a permissão", () => {
  const areas = [
    {
      territorio: [{ filial: "000001", centro: null }],
      matriz: matrizDe({ [RECEITA]: EDITA, [DEDUCOES]: EDITA }),
    },
    { territorio: [{ filial: "000025", centro: null }], matriz: matrizDe({ [RECEITA]: VE }) },
  ];

  const lido = lerAreas(gerarConcessoes(areas));

  assert.equal(lido.length, 2);
  const naMatriz = lido.find((a) => a.territorio[0].filial === "000001");
  const noHub = lido.find((a) => a.territorio[0].filial === "000025");
  assert.equal(naMatriz.matriz[RECEITA], EDITA);
  assert.equal(naMatriz.matriz[DEDUCOES], EDITA);
  assert.equal(noHub.matriz[RECEITA], VE);
  assert.equal(noHub.matriz[DEDUCOES], NADA);
});

test("ida e volta também com tudo liberado", () => {
  const matriz = matrizVazia();
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = EDITA;
  });

  const lido = lerAreas(gerarConcessoes([{ territorio: [{ filial: null, centro: null }], matriz }]));
  assert.equal(lido.length, 1);
  assert.deepEqual(lido[0].territorio, [{ filial: null, centro: null }]);
  assert.equal(
    MODULOS.every((modulo) => lido[0].matriz[modulo.id] === EDITA),
    true
  );
});

// A prévia da tela: "Vai gravar 9 concessões" descreve o banco, não a pessoa.
const CATALOGOS = {
  filiais: [
    { id: "000001", nome: "KING&JOE" },
    { id: "000025", nome: "MEN HUB" },
  ],
  centros: [{ id: "020", nome: "E-COMMERCE" }],
};

test("descreve cada área numa frase", () => {
  const frases = descreverAreas(
    [
      {
        territorio: [{ filial: "000001", centro: null }],
        matriz: matrizDe({ [RECEITA]: EDITA, [DEDUCOES]: VE }),
      },
      { territorio: [{ filial: "000025", centro: null }], matriz: matrizDe({ [RECEITA]: VE }) },
    ],
    CATALOGOS
  );

  assert.equal(frases.length, 2);
  assert.match(frases[0], /^Em KING&JOE: lança em Receita de vendas; só consulta Deduções/);
  assert.match(frases[1], /^Em MEN HUB: só consulta Receita de vendas\.$/);
});

test("todos os módulos no mesmo estado vira 'tudo'", () => {
  const matriz = matrizVazia();
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = EDITA;
  });
  const [frase] = descreverAreas([{ territorio: [{ filial: null, centro: null }], matriz }], CATALOGOS);
  assert.equal(frase, "Em tudo: lança em tudo.");
});

test("filial e centro juntos aparecem na mesma frase", () => {
  const [frase] = descreverAreas(
    [{ territorio: [{ filial: "000001", centro: "020" }], matriz: matrizDe({ [RECEITA]: VE }) }],
    CATALOGOS
  );
  assert.match(frase, /^Em KING&JOE · E-COMMERCE:/);
});

test("área sem módulo marcado não vira frase", () => {
  assert.deepEqual(descreverAreas([{ territorio: [], matriz: matrizVazia() }], CATALOGOS), []);
});

// --------------------------------------------------------------------------
// Leitura por módulo (tela de permissão módulo-primeiro)
// --------------------------------------------------------------------------

test("lerModulos: sem acesso nenhum, os oito módulos vêm desligados", () => {
  const modulos = lerModulos([]);
  assert.equal(MODULOS.every((m) => modulos[m.id].ligado === false), true);
});

test("lerModulos: concessão de um módulo só liga aquele módulo", () => {
  const modulos = lerModulos([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
  ]);
  assert.equal(modulos[RECEITA].ligado, true);
  assert.deepEqual(modulos[RECEITA].territorio, [{ filial: "000001", centro: "020" }]);
  assert.equal(modulos[RECEITA].nivel, EDITA);
  assert.equal(modulos[DEDUCOES].ligado, false);
});

test("lerModulos: módulo nulo liga todos os módulos com o mesmo lugar", () => {
  const modulos = lerModulos([{ modulo: null, filial: "000001", centro: null, podeEditar: false }]);
  assert.equal(
    MODULOS.every((m) => modulos[m.id].ligado && modulos[m.id].nivel === VE),
    true
  );
});

test("gerarConcessoesDeModulos: módulo desligado não gera concessão", () => {
  const modulos = lerModulos([]);
  assert.deepEqual(gerarConcessoesDeModulos(modulos), []);
});

test("lerModulos + gerarConcessoesDeModulos: ida e volta preserva a permissão", () => {
  const original = [
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: true },
    { modulo: RECEITA, filial: "000025", centro: null, podeEditar: true },
  ];
  const concessoes = gerarConcessoesDeModulos(lerModulos(original));
  assert.equal(lerAreas(concessoes).length, lerAreas(original).length);
  assert.deepEqual(lerAreas(concessoes), lerAreas(original));
});

test("lerModulos + gerarConcessoesDeModulos: acesso global usa a forma canônica e sobrevive", () => {
  const original = [{ modulo: RECEITA, filial: null, centro: null, podeEditar: false }];
  const modulos = lerModulos(original);

  assert.equal(territorioIrrestrito([]), false, "vazio é 'nenhum local ainda', não 'tudo'");
  assert.equal(territorioIrrestrito([TUDO]), true, "só a linha explícita conta como irrestrito");
  assert.deepEqual(modulos[RECEITA].territorio, [TUDO]);
  assert.deepEqual(gerarConcessoesDeModulos(modulos), original);
});

test("gerarConcessoesDeModulos: módulo ligado com território vazio não concede nada (não vira 'tudo')", () => {
  const modulos = lerModulos([]);
  modulos[RECEITA] = { ligado: true, territorio: [], nivel: EDITA, acessosOriginais: [] };
  assert.deepEqual(gerarConcessoesDeModulos(modulos), []);
});

test("aplicarNivelAosModulos: preserva o recorte territorial já configurado", () => {
  const modulos = lerModulos([
    { modulo: RECEITA, filial: "000001", centro: "020", podeEditar: false },
  ]);

  const atualizados = aplicarNivelAosModulos(modulos, EDITA);

  assert.deepEqual(atualizados[RECEITA].territorio, [
    { filial: "000001", centro: "020" },
  ]);
  assert.equal(atualizados[RECEITA].nivel, EDITA);
  assert.equal(atualizados[RECEITA].ligado, true);
});

test("aplicarNivelAosModulos: só usa toda a empresa quando o módulo nunca teve escopo", () => {
  const atualizados = aplicarNivelAosModulos(lerModulos([]), VE);

  assert.equal(MODULOS.every((modulo) => atualizados[modulo.id].ligado), true);
  assert.equal(
    MODULOS.every((modulo) => territorioIrrestrito(atualizados[modulo.id].territorio)),
    true
  );
});

test("lerModulos + gerarConcessoesDeModulos: nível misto não promove quem só vê", () => {
  const original = [
    { modulo: RECEITA, filial: "000001", centro: null, podeEditar: true },
    { modulo: RECEITA, filial: "000025", centro: null, podeEditar: false },
  ];
  const modulos = lerModulos(original);

  assert.equal(modulos[RECEITA].nivel, null);
  assert.deepEqual(gerarConcessoesDeModulos(modulos), original);

  modulos[RECEITA] = { ...modulos[RECEITA], nivel: VE };
  assert.equal(
    gerarConcessoesDeModulos(modulos).every((acesso) => acesso.podeEditar === false),
    true,
    "só fica uniforme depois de uma escolha explícita"
  );
});

// --------------------------------------------------------------------------
// Árvore de filial × centro
// --------------------------------------------------------------------------

const CATALOGOS_ARVORE = {
  filiais: [
    { id: "000001", nome: "KING&JOE" },
    { id: "000025", nome: "MEN HUB" },
  ],
  centros: [
    { id: "020", nome: "E-COMMERCE" },
    { id: "030", nome: "ADMINISTRAÇÃO" },
  ],
};

test("alternarFilialNaArvore: marcar uma filial vazia (excluída) adiciona ela inteira", () => {
  const territorio = alternarFilialNaArvore(
    [{ filial: "000025", centro: "020" }],
    CATALOGOS_ARVORE,
    "000001",
    "vazio"
  );
  assert.deepEqual(territorio, [
    { filial: "000025", centro: "020" },
    { filial: "000001", centro: null },
  ]);
});

test("alternarFilialNaArvore: desmarcar tira a filial e preserva as outras", () => {
  const territorio = alternarFilialNaArvore(
    [
      { filial: "000001", centro: null },
      { filial: "000025", centro: "020" },
    ],
    CATALOGOS_ARVORE,
    "000001",
    "total"
  );
  assert.deepEqual(territorio, [{ filial: "000025", centro: "020" }]);
});

// [TUDO] é "tudo" de verdade — desmarcar uma filial a partir daí não pode
// apagar as outras junto, então a primeira mexida materializa todo mundo por
// extenso. (`[]` não entra mais nesse teste: agora significa "nenhum local
// ainda", não "tudo" — não faria sentido pedir pra desmarcar uma filial que a
// própria árvore já mostraria como vazia.)
test("alternarFilialNaArvore: desmarcar uma filial a partir de 'tudo' materializa as outras", () => {
  const territorio = alternarFilialNaArvore([TUDO], CATALOGOS_ARVORE, "000025", "total");
  assert.deepEqual(territorio, [{ filial: "000001", centro: null }]);
});

test("alternarFilialNaArvore: marcar de volta a última filial que faltava compacta em 'tudo'", () => {
  const territorio = alternarFilialNaArvore(
    [{ filial: "000001", centro: null }],
    CATALOGOS_ARVORE,
    "000025",
    "vazio"
  );
  assert.deepEqual(territorio, [TUDO]);
});

test("alternarCentroNaArvore: marcar um centro numa filial vazia (excluída) adiciona só ele", () => {
  const territorio = alternarCentroNaArvore(
    [{ filial: "000025", centro: null }],
    CATALOGOS_ARVORE,
    "000001",
    "020",
    false
  );
  assert.deepEqual(territorio, [
    { filial: "000025", centro: null },
    { filial: "000001", centro: "020" },
  ]);
});

test("alternarCentroNaArvore: desmarcar um centro a partir de 'tudo' materializa as outras filiais", () => {
  const territorio = alternarCentroNaArvore([TUDO], CATALOGOS_ARVORE, "000001", "020", true);
  assert.deepEqual(territorio, [
    { filial: "000025", centro: null },
    { filial: "000001", centro: "030" },
  ]);
});

test("alternarCentroNaArvore: marcar todos os centros compacta em filial inteira", () => {
  const territorio = alternarCentroNaArvore(
    [{ filial: "000001", centro: "020" }],
    CATALOGOS_ARVORE,
    "000001",
    "030",
    false
  );
  assert.deepEqual(territorio, [{ filial: "000001", centro: null }]);
});

test("alternarCentroNaArvore: desmarcar um centro de filial inteira materializa o resto", () => {
  const territorio = alternarCentroNaArvore(
    [{ filial: "000001", centro: null }],
    CATALOGOS_ARVORE,
    "000001",
    "020",
    true
  );
  assert.deepEqual(territorio, [{ filial: "000001", centro: "030" }]);
});

// Filial/centro mudam com o tempo — desmarcar o último não pode ficar preso
// nem virar "libera pra empresa inteira" sozinho. Esvazia de verdade; quem
// grava trata módulo ligado + território vazio como "não concede nada".
test("alternarCentroNaArvore: desmarcar o último centro esvazia de verdade", () => {
  const territorio = alternarCentroNaArvore(
    [{ filial: "000001", centro: "020" }],
    CATALOGOS_ARVORE,
    "000001",
    "020",
    true
  );
  assert.deepEqual(territorio, []);
});

test("alternarFilialNaArvore: desmarcar a última filial esvazia de verdade", () => {
  const territorio = alternarFilialNaArvore(
    [{ filial: "000001", centro: null }],
    CATALOGOS_ARVORE,
    "000001",
    "total"
  );
  assert.deepEqual(territorio, []);
});

// Vazio é "tudo" pra quem grava — a árvore precisa mostrar isso como tudo
// marcado, não como nada marcado (senão parece que ninguém tem acesso).
// Vazio agora é "nenhum local ainda" (não "tudo") — a árvore precisa mostrar
// as duas filiais desmarcadas, senão dá a entender que foi concedido acesso
// a alguma coisa quando não foi.
test("nosDoTerritorio: vazio mostra as duas filiais desmarcadas", () => {
  const nos = nosDoTerritorio([], CATALOGOS_ARVORE, new Set());
  assert.equal(nos.length, 2);
  assert.equal(
    nos.every((no) => no.nivel === 0 && no.estado === "vazio" && !no.aberto),
    true
  );
});

test("nosDoTerritorio: vazio expandido mostra os centros também desmarcados", () => {
  const nos = nosDoTerritorio([], CATALOGOS_ARVORE, new Set(["000001"]));
  const centros = nos.filter((no) => no.nivel === 1);
  assert.equal(centros.length, 2);
  assert.equal(
    centros.every((no) => no.estado === "vazio"),
    true
  );
});

test("nosDoTerritorio: linha explícita de tudo também mostra tudo marcado", () => {
  const nos = nosDoTerritorio([TUDO], CATALOGOS_ARVORE, new Set(["000001"]));
  assert.equal(
    nos.every((no) => no.estado === "total"),
    true
  );
});

test("nosDoTerritorio: centro curinga aparece marcado em todas as filiais e materializa no toggle", () => {
  const curinga = [{ filial: null, centro: "020" }];
  const nos = nosDoTerritorio(curinga, CATALOGOS_ARVORE, new Set(["000001", "000025"]));
  const filiais = nos.filter((no) => no.nivel === 0);
  const centros020 = nos.filter((no) => no.nivel === 1 && no.codigo === "020");

  assert.equal(filiais.every((no) => no.estado === "parcial" && no.marcadosAbaixo === 1), true);
  assert.equal(centros020.every((no) => no.estado === "total"), true);
  assert.deepEqual(gerarConcessoesDeModulos(lerModulos([
    { modulo: RECEITA, filial: null, centro: "020", podeEditar: false },
  ])), [
    { modulo: RECEITA, filial: null, centro: "020", podeEditar: false },
  ]);

  assert.deepEqual(
    alternarCentroNaArvore(curinga, CATALOGOS_ARVORE, "000001", "020", true),
    [{ filial: "000025", centro: "020" }]
  );
  assert.deepEqual(
    alternarFilialNaArvore(curinga, CATALOGOS_ARVORE, "000001", "parcial"),
    [
      { filial: "000025", centro: "020" },
      { filial: "000001", centro: null },
    ]
  );
});

test("nosDoTerritorio: filial inteira aparece 'total', centros marcados quando expande", () => {
  const nos = nosDoTerritorio(
    [{ filial: "000001", centro: null }],
    CATALOGOS_ARVORE,
    new Set(["000001"])
  );
  const filial = nos.find((no) => no.nivel === 0 && no.codigo === "000001");
  assert.equal(filial.estado, "total");
  const centros = nos.filter((no) => no.nivel === 1);
  assert.equal(centros.length, 2);
  assert.equal(
    centros.every((no) => no.estado === "total"),
    true
  );
});

test("nosDoTerritorio: um centro marcado deixa a filial 'parcial'", () => {
  const nos = nosDoTerritorio(
    [{ filial: "000001", centro: "020" }],
    CATALOGOS_ARVORE,
    new Set(["000001"])
  );
  const filial = nos.find((no) => no.nivel === 0);
  assert.equal(filial.estado, "parcial");
  assert.equal(filial.marcadosAbaixo, 1);
  const centro020 = nos.find((no) => no.nivel === 1 && no.codigo === "020");
  const centro030 = nos.find((no) => no.nivel === 1 && no.codigo === "030");
  assert.equal(centro020.estado, "total");
  assert.equal(centro030.estado, "vazio");
});
