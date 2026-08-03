import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

// O cliente da API fala com `window.location` e `fetch`. Ambos são substituídos
// aqui: o teste é sobre o fio entre 401 e o aviso, não sobre rede.
globalThis.window = { location: { origin: "http://localhost" } };

const { api, quandoSessaoExpirar } = await import("../src/lib/api.js");

function responder(status, corpo) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(corpo),
  });
}

afterEach(() => quandoSessaoExpirar(null));

describe("sessão expirada no meio do uso", () => {
  it("401 em rota comum avisa quem cuida da sessão", async () => {
    let avisos = 0;
    quandoSessaoExpirar(() => (avisos += 1));
    responder(401, { erro: "Sessão expirada." });

    await assert.rejects(() => api.estado());
    assert.equal(avisos, 1);
  });

  // Sem isto, cada tela precisaria lembrar de tratar 401 no próprio catch — e
  // basta uma esquecer para a pessoa ficar numa tela morta sem saber por quê.
  it("vale para qualquer rota, não só para uma", async () => {
    const chamadas = [];
    quandoSessaoExpirar(() => chamadas.push(1));
    responder(401, { erro: "Sessão expirada." });

    for (const chamar of [
      () => api.contas("25"),
      () => api.filiais(),
      () => api.usuarios(),
      () => api.salvarPlanejado("p1", []),
    ]) {
      await assert.rejects(chamar);
    }
    assert.equal(chamadas.length, 4);
  });

  // 401 no login é senha errada. Derrubar a sessão ali apagaria a mensagem que a
  // pessoa precisa ler.
  it("401 no próprio login NÃO conta como sessão expirada", async () => {
    let avisos = 0;
    quandoSessaoExpirar(() => (avisos += 1));
    responder(401, { erro: "Usuário ou senha inválidos." });

    await assert.rejects(() => api.login("fulano", "errada"));
    assert.equal(avisos, 0);
  });

  it("resposta boa não avisa nada", async () => {
    let avisos = 0;
    quandoSessaoExpirar(() => (avisos += 1));
    responder(200, { ok: true });

    await api.estado();
    assert.equal(avisos, 0);
  });

  it("outros erros não são tratados como sessão morta", async () => {
    let avisos = 0;
    quandoSessaoExpirar(() => (avisos += 1));
    responder(403, { erro: "Sem permissão." });

    await assert.rejects(() => api.usuarios());
    assert.equal(avisos, 0);
  });

  it("429 do limite de tentativas chega com a mensagem do servidor", async () => {
    responder(429, { erro: "Tentativas demais. Espere 5 min e tente de novo." });
    await assert.rejects(
      () => api.login("fulano", "errada"),
      (erro) => erro.status === 429 && /Espere 5 min/.test(erro.message)
    );
  });
});
