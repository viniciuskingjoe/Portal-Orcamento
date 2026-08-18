import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  descartarEstadoLegado,
  estadoInicial,
  lerEstadoLegado,
  normalizarEstado,
} from "../src/lib/persistencia.js";

const CHAVE = "portal-orcamento:estado:v5";

// localStorage falso, trocado por teste. Sem isto os testes rodariam contra o
// armazenamento real do runtime (que no Node não existe).
function comArmazenamento(conteudo, executar, chave = CHAVE) {
  const original = globalThis.localStorage;
  const dados = new Map(conteudo == null ? [] : [[chave, conteudo]]);
  globalThis.localStorage = {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
  try {
    return executar(dados);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test("estado inicial é vazio; filiais ativas ainda não escolhidas", () => {
  // `filiaisAtivas: null` vale por "todas". Lista vazia é diferente: quer dizer
  // que o usuário desmarcou todas de propósito.
  assert.deepEqual(estadoInicial(), {
    configuracao: { filiaisAtivas: null },
    visoes: [],
    planos: [],
  });
});

test("sem nada gravado, não há legado a importar", () => {
  // `null` e não estado vazio: é a diferença entre "não tem nada para trazer" e
  // "tem, e está vazio" — só o primeiro esconde o convite de importação.
  comArmazenamento(null, () => {
    assert.equal(lerEstadoLegado(), null);
  });
});

test("lista vazia de filiais ativas é preservada, não vira null", () => {
  // Vazio quer dizer "desmarquei todas"; null quer dizer "ainda não escolhi".
  const estado = { configuracao: { filiaisAtivas: [] }, visoes: [], planos: [] };
  assert.deepEqual(normalizarEstado(estado).configuracao.filiaisAtivas, []);
  assert.equal(normalizarEstado({ visoes: [], planos: [] }).configuracao.filiaisAtivas, null);
});

test("normalizar preserva visão, filiais ativas e planejado", () => {
  const estado = {
    configuracao: { filiaisAtivas: ["000001", "000025"] },
    visoes: [
      {
        id: "v1",
        nome: "DRE 2026",
        visaoContabil: "25",
        modulos: {
          "receita-vendas": {
            usaCentro: false,
            sinais: {},
            formulas: {},
            filiais: { "000025": { contas: ["3.1.1.01.001"], centros: {} } },
          },
        },
        dreLinhas: [],
      },
    ],
    planos: [
      {
        id: "p1",
        nome: "Oficial",
        ano: 2026,
        visaoId: "v1",
        planejado: { "receita-vendas|000025||3.1.1.01.001|1": 1500.5 },
        funcionarios: {},
        situacao: "ativo",
        idOrcamento: null,
        publicadoEm: null,
        publicadoLinhas: null,
      },
    ],
  };

  // A peneira não pode alterar o que já está correto.
  assert.deepEqual(normalizarEstado(estado), estado);

  // E o mesmo vale saindo do navegador.
  comArmazenamento(JSON.stringify(estado), () => {
    assert.deepEqual(lerEstadoLegado(), estado);
  });
});

// Regressão: `normalizarPlano`/`normalizarVisao` reconstruíam o objeto
// listando os campos um a um, e dois ficaram de fora — `funcionarios` e
// `formulas` desapareciam a cada recarga (F5, ou a atualização de fundo a
// cada minuto), mesmo com o valor gravado certinho no banco. A gravação
// nunca teve bug; a leitura que descartava o que acabou de vir da API.
test("funcionários e fórmula sobrevivem à normalização — não é o campo `planejado` que a API devolve", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "DRE 2026",
        visaoContabil: "25",
        modulos: {
          "despesas-pessoal": {
            usaCentro: true,
            sinais: {},
            formulas: { "4.2.1.10.001": { expressao: "(V[4.2.1.10.002] + V[4.2.1.10.003]) / 12" } },
            filiais: { "000001": { contas: ["4.2.1.10.001"], centros: { "002": ["4.2.1.10.001"] } } },
          },
        },
      },
    ],
    planos: [
      {
        id: "p1",
        nome: "TESTE",
        ano: 2026,
        visaoId: "v1",
        planejado: {},
        funcionarios: { "000001|002|1": 10, "000001|002|2": 10 },
      },
    ],
  };

  const normalizado = normalizarEstado(estado);
  assert.deepEqual(normalizado.planos[0].funcionarios, { "000001|002|1": 10, "000001|002|2": 10 });
  assert.deepEqual(normalizado.visoes[0].modulos["despesas-pessoal"].formulas, {
    "4.2.1.10.001": { expressao: "(V[4.2.1.10.002] + V[4.2.1.10.003]) / 12" },
  });
});

// Mesma classe de bug do teste acima, agora para o modelo de DRE — escrito
// antes de `dreLinhas` existir de verdade na tela, pra não repetir o mesmo
// ciclo (gravar certo, sumir na próxima recarga).
test("linhas do DRE sobrevivem à normalização", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "DRE 2026",
        visaoContabil: "25",
        modulos: {},
        dreLinhas: [
          {
            id: "receita",
            ordem: 0,
            titulo: "Receita",
            origem: "modulo",
            moduloId: "receita-vendas",
            sinal: 1,
            valores: [{ codigo: "3.1.1.01.001", sinal: 1 }],
            formula: null,
            mostra: true,
            destaca: false,
            baseAnaliseVertical: true,
            linhaPrincipal: false,
            unidade: "moeda",
          },
          {
            id: "resultado",
            ordem: 1,
            titulo: "Resultado",
            origem: "formula",
            moduloId: null,
            sinal: null,
            valores: [],
            formula: "L[receita]",
            mostra: true,
            destaca: true,
            baseAnaliseVertical: false,
            linhaPrincipal: true,
            unidade: "moeda",
          },
        ],
      },
    ],
    planos: [],
  };

  const normalizado = normalizarEstado(estado);
  assert.deepEqual(normalizado.visoes[0].dreLinhas, estado.visoes[0].dreLinhas);
});

test("valores da linha de DRE: item sem código cai fora, sinal fora de 1/-1 vira 1", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "X",
        visaoContabil: "25",
        modulos: {},
        dreLinhas: [
          {
            id: "linha",
            titulo: "Linha",
            origem: "modulo",
            moduloId: "receita-vendas",
            valores: [{ codigo: "3.1.1.01.001", sinal: -1 }, { codigo: "3.1.1.01.002" }, { sinal: 1 }],
          },
        ],
      },
    ],
    planos: [],
  };
  const [linha] = normalizarEstado(estado).visoes[0].dreLinhas;
  assert.deepEqual(linha.valores, [
    { codigo: "3.1.1.01.001", sinal: -1 },
    { codigo: "3.1.1.01.002", sinal: 1 },
  ]);
});

test("visão sem dreLinhas nasce com lista vazia, não undefined", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [{ id: "v1", nome: "X", visaoContabil: "25", modulos: {} }],
    planos: [],
  };
  assert.deepEqual(normalizarEstado(estado).visoes[0].dreLinhas, []);
});

test("linha de DRE com origem inválida é descartada, não propaga lixo", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "X",
        visaoContabil: "25",
        modulos: {},
        dreLinhas: [
          { id: "boa", titulo: "Boa", origem: "formula", formula: "1+1" },
          { id: "ruim", titulo: "Ruim", origem: "algo-estranho" },
          { semId: true },
        ],
      },
    ],
    planos: [],
  };
  const linhas = normalizarEstado(estado).visoes[0].dreLinhas;
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].id, "boa");
});

test("plano sem funcionários/situação/publicação nasce com o default certo, não undefined", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [],
    planos: [{ id: "p1", nome: "X", ano: 2026, visaoId: null, planejado: {} }],
  };
  const plano = normalizarEstado(estado).planos[0];
  assert.deepEqual(plano.funcionarios, {});
  assert.equal(plano.situacao, "ativo");
  assert.equal(plano.idOrcamento, null);
  assert.equal(plano.publicadoEm, null);
  assert.equal(plano.publicadoLinhas, null);
});

test("visão sem formulas nasce com objeto vazio, não undefined", () => {
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "X",
        visaoContabil: "25",
        modulos: { "despesas-pessoal": { usaCentro: true, sinais: {}, filiais: {} } },
      },
    ],
    planos: [],
  };
  assert.deepEqual(normalizarEstado(estado).visoes[0].modulos["despesas-pessoal"].formulas, {});
});

test("o que o centro tem é o que vale, e a filial acompanha", () => {
  // A regra virou: com centro, quem lança é o centro e a lista da filial é o
  // consolidado. Gravação antiga com sobra na filial se conserta na leitura.
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "X",
        visaoContabil: "25",
        modulos: {
          "despesas-operacionais": {
            usaCentro: true,
            filiais: {
              "000001": { contas: ["4.4.1.01"], centros: { "002": ["4.4.1.01", "9.9.9"] } },
            },
          },
        },
      },
    ],
    planos: [],
  };

  comArmazenamento(JSON.stringify(estado), () => {
    const daFilial = lerEstadoLegado().visoes[0].modulos["despesas-operacionais"].filiais["000001"];
    assert.deepEqual(daFilial.centros["002"], ["4.4.1.01", "9.9.9"]);
    assert.deepEqual(daFilial.contas, ["4.4.1.01", "9.9.9"]);
  });
});

test("módulo sem centro guarda a lista da filial como escolha", () => {
  const estado = {
    visoes: [
      {
        id: "v1",
        nome: "X",
        visaoContabil: "25",
        modulos: {
          m: { usaCentro: false, filiais: { f: { contas: ["A"], centros: {} } } },
        },
      },
    ],
    planos: [],
  };
  comArmazenamento(JSON.stringify(estado), () => {
    assert.deepEqual(lerEstadoLegado().visoes[0].modulos.m.filiais.f.contas, ["A"]);
  });
});

test("JSON corrompido não estoura nem vira convite de importação", () => {
  comArmazenamento("{isso nao e json", () => {
    assert.equal(lerEstadoLegado(), null);
  });
});

test("versão anterior é ignorada: os ids não casam", () => {
  // A v4 gravava o planejado sem centro e sem conta na chave, e o plano tinha
  // início/fim em vez de ano. Migrar deixaria chaves órfãs.
  const v4 = JSON.stringify({
    visoes: [{ id: "v1", nome: "DRE", modulos: { "receita-vendas": ["3.1.1.01.001"] } }],
    planos: [{ id: "velho", nome: "Velho", inicio: 2024, fim: 2026, planejado: { "x|y|2025|1": 9 } }],
  });
  // Gravado sob outra chave: a leitura nem enxerga.
  comArmazenamento(v4, () => assert.equal(lerEstadoLegado(), null), "portal-orcamento:estado:v4");
});

test("array solto (formato v1) é ignorado", () => {
  comArmazenamento(JSON.stringify([{ id: "velho", nome: "Velho" }]), () => {
    assert.equal(lerEstadoLegado(), null);
  });
});

test("plano sem ano é descartado", () => {
  // Sem ano não há período para orçar: o registro está quebrado.
  const bom = { id: "p1", nome: "Bom", ano: 2026 };
  const ruim = { id: "p2", nome: "Ruim" };
  comArmazenamento(JSON.stringify({ planos: [bom, ruim], visoes: [] }), () => {
    assert.deepEqual(
      lerEstadoLegado().planos.map((p) => p.id),
      ["p1"]
    );
  });
});

test("campos estranhos no plano são descartados na leitura", () => {
  const plano = {
    id: "p1",
    nome: "Um",
    ano: 2026,
    visaoId: "v1",
    planejado: {},
    inicio: 2024,
    fim: 2026,
    filiais: [{ id: "akr" }],
  };
  comArmazenamento(JSON.stringify({ planos: [plano], visoes: [] }), () => {
    const [carregado] = lerEstadoLegado().planos;
    assert.equal(carregado.inicio, undefined);
    assert.equal(carregado.filiais, undefined);
  });
});

test("valor planejado não numérico é descartado", () => {
  // Uma string aqui viraria NaN na soma e contaminaria a coluna inteira.
  const plano = {
    id: "p1",
    nome: "Um",
    ano: 2026,
    planejado: { "m|f||c|1": 10, "m|f||c|2": "abc", "m|f||c|3": null },
  };
  comArmazenamento(JSON.stringify({ planos: [plano], visoes: [] }), () => {
    assert.deepEqual(lerEstadoLegado().planos[0].planejado, { "m|f||c|1": 10 });
  });
});

test("visão sem módulos vira objeto vazio, não undefined", () => {
  comArmazenamento(JSON.stringify({ planos: [], visoes: [{ id: "v1", nome: "X" }] }), () => {
    const [visao] = lerEstadoLegado().visoes;
    assert.deepEqual(visao.modulos, {});
    assert.equal(visao.visaoContabil, null);
  });
});

test("normalizarEstado vale para o que vem da API, não só do navegador", () => {
  // Mesma peneira nas duas origens: linha estranha no banco não pode virar NaN
  // numa soma de dinheiro.
  const daApi = normalizarEstado({
    configuracao: { filiaisAtivas: ["000001"] },
    visoes: [{ id: "v1", nome: "DRE", visaoContabil: "25", modulos: {} }],
    planos: [{ id: "p1", nome: "P", ano: 2026, planejado: { "m|f||c|1": "texto", "m|f||c|2": 10 } }],
  });

  assert.deepEqual(daApi.configuracao.filiaisAtivas, ["000001"]);
  assert.deepEqual(daApi.planos[0].planejado, { "m|f||c|2": 10 });
});

test("resposta sem as listas cai no estado inicial", () => {
  assert.deepEqual(normalizarEstado(null), estadoInicial());
  assert.deepEqual(normalizarEstado({ visoes: [] }), estadoInicial());
});

test("descartar o legado impede o convite de aparecer de novo", () => {
  const conteudo = JSON.stringify({
    visoes: [{ id: "v1", nome: "X", modulos: {} }],
    planos: [],
  });
  comArmazenamento(conteudo, () => {
    assert.ok(lerEstadoLegado());
    descartarEstadoLegado();
    assert.equal(lerEstadoLegado(), null);
  });
});

test("centro em uso sem conta sobrevive à recarga", () => {
  // Regressão: o normalizador descartava centro vazio, então marcar o centro e
  // recarregar a página desfazia a marcação.
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "DRE",
        visaoContabil: "25",
        modulos: {
          "despesas-operacionais": {
            usaCentro: true,
            filiais: { "000001": { contas: [], centros: { "052": [], "002": ["4.4.1.01"] } } },
          },
        },
      },
    ],
    planos: [],
  };

  const [visao] = comArmazenamento(JSON.stringify(estado), lerEstadoLegado).visoes;
  const daFilial = visao.modulos["despesas-operacionais"].filiais["000001"];

  assert.deepEqual(Object.keys(daFilial.centros).sort(), ["002", "052"]);
  // E a lista da filial sai como o consolidado dos centros.
  assert.deepEqual(daFilial.contas, ["4.4.1.01"]);
});

test("contas da filial são recalculadas dos centros ao carregar", () => {
  // Gravação antiga trazia a lista da filial como escolha própria. Com centro,
  // quem manda são os centros — o consolidado se conserta sozinho.
  const estado = {
    configuracao: { filiaisAtivas: null },
    visoes: [
      {
        id: "v1",
        nome: "DRE",
        visaoContabil: "25",
        modulos: {
          "despesas-operacionais": {
            usaCentro: true,
            filiais: {
              "000001": { contas: ["9.9.9", "4.4.1.01"], centros: { "002": ["4.4.1.01"] } },
            },
          },
        },
      },
    ],
    planos: [],
  };

  const [visao] = comArmazenamento(JSON.stringify(estado), lerEstadoLegado).visoes;
  assert.deepEqual(visao.modulos["despesas-operacionais"].filiais["000001"].contas, ["4.4.1.01"]);
});
