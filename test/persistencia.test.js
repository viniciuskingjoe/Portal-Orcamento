import { strict as assert } from "node:assert";
import { test } from "node:test";

import { carregarEstado, estadoInicial, salvarEstado } from "../src/lib/persistencia.js";

// localStorage falso, trocado por teste. Sem isto os testes rodariam contra o
// armazenamento real do runtime (que no Node não existe).
function comArmazenamento(conteudo, executar) {
  const original = globalThis.localStorage;
  const dados = new Map(conteudo ? [["portal-orcamento:estado:v3", conteudo]] : []);
  globalThis.localStorage = {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: (chave) => dados.delete(chave),
  };
  try {
    return executar(dados);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

// Armazenamento com uma chave arbitrária, para exercitar a migração da v2.
function comChave(chave, conteudo, executar) {
  const original = globalThis.localStorage;
  const dados = new Map([[chave, conteudo]]);
  globalThis.localStorage = {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
  try {
    return executar();
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test("estado inicial tem configuração global além de visões e planos", () => {
  const estado = estadoInicial();
  assert.ok(estado.configuracao.filiais.length > 0);
  assert.ok(estado.configuracao.centros.length > 0);
  // Na v3 filiais e centros NÃO ficam dentro do plano.
  estado.planos.forEach((plano) => {
    assert.equal(plano.filiais, undefined);
    assert.equal(plano.centros, undefined);
  });
});

test("v2 é migrada: filiais e centros sobem dos planos para a configuração", () => {
  const v2 = {
    visoes: [{ id: "v1", nome: "DRE", modulos: {} }],
    planos: [
      {
        id: "p1",
        nome: "Um",
        inicio: 2024,
        fim: 2026,
        visaoId: "v1",
        planejado: { "receita-vendas|akr|2026|1": 500 },
        filiais: [{ id: "akr", nome: "AKR", fator: 1 }],
        centros: [{ id: "adm", nome: "ADM" }],
      },
      {
        id: "p2",
        nome: "Dois",
        inicio: 2024,
        fim: 2026,
        visaoId: "v1",
        planejado: {},
        // Lista divergente: união por id, senão a filial só desta cópia se perderia
        // e as edições ligadas a ela ficariam órfãs.
        filiais: [{ id: "akr", nome: "AKR", fator: 1 }, { id: "loja", nome: "Loja", fator: 0.6 }],
        centros: [{ id: "adm", nome: "ADM" }],
      },
    ],
  };

  comChave("portal-orcamento:estado:v2", JSON.stringify(v2), () => {
    const estado = carregarEstado();
    assert.deepEqual(
      estado.configuracao.filiais.map((f) => f.id).sort(),
      ["akr", "loja"]
    );
    assert.deepEqual(estado.configuracao.centros.map((c) => c.id), ["adm"]);
    // As edições do plano sobrevivem e filiais/centros saem de dentro dele.
    assert.deepEqual(estado.planos[0].planejado, { "receita-vendas|akr|2026|1": 500 });
    assert.equal(estado.planos[0].filiais, undefined);
    assert.equal(estado.planos[0].centros, undefined);
  });
});

test("v3 tem prioridade sobre v2", () => {
  const original = globalThis.localStorage;
  const dados = new Map([
    ["portal-orcamento:estado:v2", JSON.stringify({ visoes: [], planos: [{ id: "velho", nome: "Velho", inicio: 2024, fim: 2026 }] })],
    ["portal-orcamento:estado:v3", JSON.stringify({ configuracao: { filiais: [], centros: [] }, visoes: [], planos: [{ id: "novo", nome: "Novo", inicio: 2024, fim: 2026 }] })],
  ]);
  globalThis.localStorage = { getItem: (k) => dados.get(k) ?? null, setItem: () => {} };
  try {
    assert.deepEqual(carregarEstado().planos.map((p) => p.id), ["novo"]);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test("estado inicial tem visão e planos apontando para ela", () => {
  const estado = estadoInicial();
  assert.ok(estado.visoes.length > 0);
  assert.ok(estado.planos.length > 0);
  estado.planos.forEach((plano) => {
    assert.ok(
      estado.visoes.some((visao) => visao.id === plano.visaoId),
      `${plano.nome} aponta para uma visão inexistente`
    );
  });
});

test("sem nada gravado, cai no estado inicial", () => {
  comArmazenamento(null, () => {
    const estado = carregarEstado();
    assert.ok(estado.visoes.length > 0);
    assert.ok(estado.planos.length > 0);
  });
});

test("ida e volta preserva visões e planos", () => {
  comArmazenamento(null, () => {
    const original = estadoInicial();
    assert.deepEqual(salvarEstado(original), { ok: true });

    const lido = carregarEstado();
    assert.deepEqual(
      lido.visoes.map((v) => v.id),
      original.visoes.map((v) => v.id)
    );
    assert.deepEqual(lido.planos[0].visaoId, original.planos[0].visaoId);
    assert.deepEqual(lido.visoes[0].modulos, original.visoes[0].modulos);
  });
});

test("JSON corrompido cai no estado inicial em vez de estourar", () => {
  comArmazenamento("{isso nao e json", () => {
    const estado = carregarEstado();
    assert.ok(estado.planos.length > 0);
  });
});

test("formato antigo (só array de planos) é ignorado", () => {
  // A v1 guardava um array de planos com canais e deduções. Não há equivalente
  // no modelo de visões, então o estado inicial assume.
  comArmazenamento(JSON.stringify([{ id: "velho", nome: "Velho" }]), () => {
    const estado = carregarEstado();
    assert.ok(estado.visoes.length > 0);
    assert.ok(!estado.planos.some((plano) => plano.id === "velho"));
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
  const plano = {
    id: "p1",
    nome: "Sem visão",
    inicio: 2024,
    fim: 2026,
    filiais: [],
    centros: [],
  };
  comArmazenamento(JSON.stringify({ planos: [plano], visoes: [] }), () => {
    const [carregado] = carregarEstado().planos;
    assert.equal(carregado.visaoId, null);
    assert.deepEqual(carregado.planejado, {});
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
