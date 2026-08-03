import { strict as assert } from "node:assert";
import { test } from "node:test";

import { carregarEstado, estadoInicial, salvarEstado } from "../src/lib/persistencia.js";

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

test("sem nada gravado, carrega o estado inicial", () => {
  comArmazenamento(null, () => {
    assert.deepEqual(carregarEstado(), estadoInicial());
  });
});

test("lista vazia de filiais ativas é preservada, não vira null", () => {
  const estado = { configuracao: { filiaisAtivas: [] }, visoes: [], planos: [] };
  comArmazenamento(JSON.stringify(estado), () => {
    assert.deepEqual(carregarEstado().configuracao.filiaisAtivas, []);
  });
});

test("ida e volta preserva visão, filiais ativas e planejado", () => {
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
            filiais: { "000025": { contas: ["3.1.1.01.001"], centros: {} } },
          },
        },
      },
    ],
    planos: [
      {
        id: "p1",
        nome: "Oficial",
        ano: 2026,
        visaoId: "v1",
        planejado: { "receita-vendas|000025||3.1.1.01.001|1": 1500.5 },
      },
    ],
  };

  comArmazenamento(null, () => {
    assert.deepEqual(salvarEstado(estado), { ok: true });
    assert.deepEqual(carregarEstado(), estado);
  });
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
    const daFilial = carregarEstado().visoes[0].modulos["despesas-operacionais"].filiais["000001"];
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
    assert.deepEqual(carregarEstado().visoes[0].modulos.m.filiais.f.contas, ["A"]);
  });
});

test("JSON corrompido cai no estado inicial em vez de estourar", () => {
  comArmazenamento("{isso nao e json", () => {
    assert.deepEqual(carregarEstado(), estadoInicial());
  });
});

test("versão anterior é ignorada: os ids não casam", () => {
  // A v4 gravava o planejado sem centro e sem conta na chave, e o plano tinha
  // início/fim em vez de ano. Migrar deixaria chaves órfãs.
  const v4 = JSON.stringify({
    visoes: [{ id: "v1", nome: "DRE", modulos: { "receita-vendas": ["3.1.1.01.001"] } }],
    planos: [{ id: "velho", nome: "Velho", inicio: 2024, fim: 2026, planejado: { "x|y|2025|1": 9 } }],
  });
  comArmazenamento(v4, () => assert.deepEqual(carregarEstado(), estadoInicial()), "portal-orcamento:estado:v4");
});

test("array solto (formato v1) é ignorado", () => {
  comArmazenamento(JSON.stringify([{ id: "velho", nome: "Velho" }]), () => {
    assert.deepEqual(carregarEstado(), estadoInicial());
  });
});

test("plano sem ano é descartado", () => {
  // Sem ano não há período para orçar: o registro está quebrado.
  const bom = { id: "p1", nome: "Bom", ano: 2026 };
  const ruim = { id: "p2", nome: "Ruim" };
  comArmazenamento(JSON.stringify({ planos: [bom, ruim], visoes: [] }), () => {
    assert.deepEqual(
      carregarEstado().planos.map((p) => p.id),
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
    const [carregado] = carregarEstado().planos;
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
    assert.deepEqual(carregarEstado().planos[0].planejado, { "m|f||c|1": 10 });
  });
});

test("visão sem módulos vira objeto vazio, não undefined", () => {
  comArmazenamento(JSON.stringify({ planos: [], visoes: [{ id: "v1", nome: "X" }] }), () => {
    const [visao] = carregarEstado().visoes;
    assert.deepEqual(visao.modulos, {});
    assert.equal(visao.visaoContabil, null);
  });
});

test("falha de gravação vira resultado, não exceção", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      const erro = new Error("cheio");
      erro.name = "QuotaExceededError";
      throw erro;
    },
  };
  try {
    const resultado = salvarEstado(estadoInicial());
    assert.equal(resultado.ok, false);
    assert.equal(resultado.erro, "QuotaExceededError");
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
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

  const [visao] = comArmazenamento(JSON.stringify(estado), carregarEstado).visoes;
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

  const [visao] = comArmazenamento(JSON.stringify(estado), carregarEstado).visoes;
  assert.deepEqual(visao.modulos["despesas-operacionais"].filiais["000001"].contas, ["4.4.1.01"]);
});
