import { strict as assert } from "node:assert";
import { test } from "node:test";

import { carregarEstado, estadoInicial, salvarEstado } from "../src/lib/persistencia.js";

const CHAVE = "portal-orcamento:estado:v4";

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

test("estado inicial é vazio: visões e planos são criados pelo usuário", () => {
  // Não há mais seed. Filiais, centros e contas vêm do ERP; visão e plano são
  // decisão de quem usa.
  assert.deepEqual(estadoInicial(), { visoes: [], planos: [] });
});

test("sem nada gravado, carrega o estado inicial", () => {
  comArmazenamento(null, () => {
    assert.deepEqual(carregarEstado(), { visoes: [], planos: [] });
  });
});

test("ida e volta preserva visões e planejado", () => {
  const estado = {
    visoes: [{ id: "v1", nome: "DRE 2025", modulos: { "receita-vendas": ["3.1.1.1.02"] } }],
    planos: [
      {
        id: "p1",
        nome: "Oficial",
        inicio: 2024,
        fim: 2026,
        visaoId: "v1",
        planejado: { "receita-vendas|000001|2025|1": 1500.5 },
      },
    ],
  };

  comArmazenamento(null, () => {
    assert.deepEqual(salvarEstado(estado), { ok: true });
    assert.deepEqual(carregarEstado(), estado);
  });
});

test("JSON corrompido cai no estado inicial em vez de estourar", () => {
  comArmazenamento("{isso nao e json", () => {
    assert.deepEqual(carregarEstado(), { visoes: [], planos: [] });
  });
});

test("formato de versão anterior é ignorado", () => {
  // A v3 guardava `configuracao` com filiais fictícias ("akr") e o planejado
  // usava esses ids. Nada disso casa com o COD_FILIAL do ERP ("000001"), então
  // migrar deixaria chaves órfãs.
  const v3 = JSON.stringify({
    configuracao: { filiais: [{ id: "akr", nome: "AKR" }], centros: [] },
    visoes: [{ id: "v1", nome: "DRE", modulos: {} }],
    planos: [{ id: "velho", nome: "Velho", inicio: 2024, fim: 2026, planejado: { "x|akr|2025|1": 9 } }],
  });

  comArmazenamento(v3, () => {
    assert.deepEqual(carregarEstado(), { visoes: [], planos: [] });
  }, "portal-orcamento:estado:v3");
});

test("array solto (formato v1) é ignorado", () => {
  comArmazenamento(JSON.stringify([{ id: "velho", nome: "Velho" }]), () => {
    assert.deepEqual(carregarEstado(), { visoes: [], planos: [] });
  });
});

test("listas vazias são estado legítimo, não erro", () => {
  comArmazenamento(JSON.stringify({ planos: [], visoes: [] }), () => {
    const estado = carregarEstado();
    assert.deepEqual(estado.planos, []);
    assert.deepEqual(estado.visoes, []);
  });
});

test("plano sem visaoId é aceito com visão nula", () => {
  const plano = { id: "p1", nome: "Sem visão", inicio: 2024, fim: 2026 };
  comArmazenamento(JSON.stringify({ planos: [plano], visoes: [] }), () => {
    const [carregado] = carregarEstado().planos;
    assert.equal(carregado.visaoId, null);
    assert.deepEqual(carregado.planejado, {});
  });
});

test("campos estranhos no plano são descartados na leitura", () => {
  // Restos das versões antigas (filiais, centros dentro do plano) não voltam.
  const plano = {
    id: "p1",
    nome: "Um",
    inicio: 2024,
    fim: 2026,
    visaoId: "v1",
    planejado: {},
    filiais: [{ id: "akr" }],
    centros: [{ id: "adm" }],
  };
  comArmazenamento(JSON.stringify({ planos: [plano], visoes: [] }), () => {
    const [carregado] = carregarEstado().planos;
    assert.equal(carregado.filiais, undefined);
    assert.equal(carregado.centros, undefined);
  });
});

test("valor planejado não numérico é descartado", () => {
  // Uma string aqui viraria NaN na soma e contaminaria a coluna inteira.
  const plano = {
    id: "p1",
    nome: "Um",
    inicio: 2024,
    fim: 2026,
    planejado: { "m|000001|2025|1": 10, "m|000001|2025|2": "abc", "m|000001|2025|3": null },
  };
  comArmazenamento(JSON.stringify({ planos: [plano], visoes: [] }), () => {
    assert.deepEqual(carregarEstado().planos[0].planejado, { "m|000001|2025|1": 10 });
  });
});

test("visão sem módulos vira objeto vazio, não undefined", () => {
  comArmazenamento(JSON.stringify({ planos: [], visoes: [{ id: "v1", nome: "X" }] }), () => {
    assert.deepEqual(carregarEstado().visoes[0].modulos, {});
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
