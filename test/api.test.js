import { strict as assert } from "node:assert";
import { test } from "node:test";

// api.js usa window.location e fetch; os dois entram como stub.
globalThis.window = { location: { origin: "http://localhost:5173" } };

const { api } = await import("../src/lib/api.js");

function comFetch(resposta, executar) {
  const original = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url) => {
    chamadas.push(String(url));
    if (typeof resposta === "function") return resposta(url);
    return resposta;
  };
  try {
    return executar(chamadas);
  } finally {
    globalThis.fetch = original;
  }
}

const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => corpo,
});

test("resposta ok devolve o JSON", async () => {
  await comFetch(resposta(200, JSON.stringify([{ codigo: "3.1" }])), async () => {
    assert.deepEqual(await api.contas(), [{ codigo: "3.1" }]);
  });
});

test("erro com JSON usa a mensagem do backend", async () => {
  await comFetch(resposta(503, JSON.stringify({ erro: "DB_VIEW_CONTAS não definida" })), async () => {
    await assert.rejects(api.contas(), /DB_VIEW_CONTAS não definida/);
  });
});

test("500 sem corpo aponta que a API está fora", async () => {
  // Regressão: com o backend parado, o proxy do Vite responde 500 com corpo
  // vazio. A mensagem antes era "Erro 500 em /api/contas", que não diz o que
  // fazer — e o usuário lê como bug do portal.
  //
  // Fora do Vite (aqui, em `node --test`), `import.meta.env` não existe —
  // `import.meta.env?.DEV` cai em falsy, então api.js sempre usa a mensagem
  // de produção. É a mesma que roda de verdade fora do `npm run dev`, e é a
  // que vale testar (achado do critique: o texto de dev vazava pro usuário).
  await comFetch(resposta(500, ""), async () => {
    await assert.rejects(api.contas(), /Não foi possível conectar ao servidor/);
  });
});

test("500 com HTML também aponta a API fora", async () => {
  await comFetch(resposta(500, "<html>Internal Server Error</html>"), async () => {
    await assert.rejects(api.contas(), /Não foi possível conectar ao servidor/);
  });
});

test("falha de rede aponta a API fora", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(api.contas(), /Não foi possível conectar ao servidor/);
  } finally {
    globalThis.fetch = original;
  }
});

test("200 com corpo que não é JSON é erro explícito", async () => {
  await comFetch(resposta(200, "<html>ops</html>"), async () => {
    await assert.rejects(api.contas(), /não era JSON/);
  });
});

test("realizado passa ano, visão contábil e filial na query", async () => {
  await comFetch(resposta(200, "[]"), async (chamadas) => {
    await api.realizado(2025, "25", "000001");
    assert.match(chamadas[0], /\/api\/realizado\?ano=2025&visao=25&filial=000001$/);
  });
});

test("parâmetro nulo não vira string vazia na query", async () => {
  // `filial=` viraria string vazia no backend e não casaria com COD_FILIAL nenhum.
  await comFetch(resposta(200, "[]"), async (chamadas) => {
    await api.realizado(2025, "25", null);
    assert.match(chamadas[0], /\/api\/realizado\?ano=2025&visao=25$/);
  });
});

test("contas leva a visão contábil escolhida", async () => {
  await comFetch(resposta(200, "[]"), async (chamadas) => {
    await api.contas("21");
    assert.match(chamadas[0], /\/api\/contas\?visao=21$/);
  });
});
