import { strict as assert } from "node:assert";
import { test } from "node:test";

import { carregarEstado, estadoInicial, salvarEstado } from "../src/lib/persistencia.js";

// localStorage falso, trocado por teste. Sem isto os testes rodariam contra o
// armazenamento real do runtime (que no Node não existe).
function comArmazenamento(conteudo, executar) {
  const original = globalThis.localStorage;
  const dados = new Map(conteudo ? [["portal-orcamento:estado:v2", conteudo]] : []);
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
