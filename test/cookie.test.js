import test from "node:test";
import assert from "node:assert/strict";

import { cookieDaRequisicao, opcoesDoCookie } from "../server/identidade.js";

test("cookie de sessão é extraído sem confundir outros cookies", () => {
  assert.equal(
    cookieDaRequisicao({ headers: { cookie: "tema=escuro; orcamento_sid=abc%2F123; idioma=pt" } }),
    "abc/123"
  );
});

test("cookie com percent-encoding quebrado é tratado como sessão ausente", () => {
  assert.equal(cookieDaRequisicao({ headers: { cookie: "orcamento_sid=%ZZ" } }), null);
});

test("cookie de produção é Secure, httpOnly e SameSite", () => {
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const opcoes = opcoesDoCookie();
    assert.deepEqual(
      { secure: opcoes.secure, httpOnly: opcoes.httpOnly, sameSite: opcoes.sameSite },
      { secure: true, httpOnly: true, sameSite: "lax" }
    );
  } finally {
    if (anterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = anterior;
  }
});
