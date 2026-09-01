import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { origensDaEnv, validarOrigemMutavel } from "../server/origem.js";

describe("proteção de origem", () => {
  it("métodos seguros passam sem checar nada", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      assert.equal(validarOrigemMutavel({ method, origin: "http://outra-coisa.com" }), null);
    }
  });

  // Reprodução exata do bug: em `npm run dev` o Vite propaga a requisição pro
  // Express com `changeOrigin: true`, então o Host que o Express vê vira o do
  // próprio backend (localhost:3000) mesmo com o navegador em localhost:5173.
  // O Origin do navegador (5173) nunca bateria contra esse Host (3000) — mas
  // o Sec-Fetch-Site, calculado pelo navegador ANTES do proxy, já diz
  // "same-origin" e tem que bastar.
  it("Sec-Fetch-Site: same-origin passa mesmo com Origin e Host descasados por um proxy", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      origin: "http://localhost:5173",
      secFetchSite: "same-origin",
      contentType: "application/json",
      origemDaRequisicao: "http://localhost:3000",
    });
    assert.equal(erro, null);
  });

  it("recusa Origin que não bate com o Host nem com APP_ORIGINS, sem Sec-Fetch-Site same-origin", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      origin: "https://site-qualquer.com",
      secFetchSite: "cross-site",
      contentType: "application/json",
      origemDaRequisicao: "http://localhost:3000",
    });
    assert.match(erro, /não autorizada/);
  });

  it("aceita Origin que bate com o Host, sem precisar de Sec-Fetch-Site", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      origin: "http://localhost:3000",
      contentType: "application/json",
      origemDaRequisicao: "http://localhost:3000",
    });
    assert.equal(erro, null);
  });

  it("aceita Origin listado em APP_ORIGINS mesmo sem bater com o Host", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      origin: "https://portal.akrbrands.com.br",
      contentType: "application/json",
      origemDaRequisicao: "http://localhost:3000",
      origensExtras: origensDaEnv("https://portal.akrbrands.com.br"),
    });
    assert.equal(erro, null);
  });

  it("sem Origin, recusa se o navegador diz que não é same-origin", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      secFetchSite: "cross-site",
      contentType: "application/json",
      origemDaRequisicao: "http://localhost:3000",
    });
    assert.match(erro, /não autorizada/);
  });

  it("sem Origin e sem Sec-Fetch-Site (script de manutenção), aceita", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      contentType: "application/json",
      origemDaRequisicao: "http://localhost:3000",
    });
    assert.equal(erro, null);
  });

  it("recusa POST sem JSON mesmo com origem certa", () => {
    const erro = validarOrigemMutavel({
      method: "POST",
      origin: "http://localhost:3000",
      contentType: "application/x-www-form-urlencoded",
      origemDaRequisicao: "http://localhost:3000",
    });
    assert.match(erro, /application\/json/);
  });

  it("origensDaEnv ignora entradas inválidas e separa por vírgula", () => {
    const origens = origensDaEnv("https://a.com, não-é-url, https://b.com/caminho");
    assert.deepEqual([...origens].sort(), ["https://a.com", "https://b.com"]);
  });

  it("origensDaEnv vazio dá um conjunto vazio", () => {
    assert.equal(origensDaEnv("").size, 0);
    assert.equal(origensDaEnv(undefined).size, 0);
  });
});
