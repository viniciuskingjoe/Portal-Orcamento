import test from "node:test";
import assert from "node:assert/strict";

import { trustProxyDaEnv } from "../server/proxy.js";

test("proxy usa loopback por padrão", () => {
  assert.equal(trustProxyDaEnv(), "loopback");
  assert.equal(trustProxyDaEnv("  "), "loopback");
});

test("proxy rejeita número vindo do env", () => {
  assert.throws(() => trustProxyDaEnv("3000"), /não aceita número/);
  assert.throws(() => trustProxyDaEnv("1"), /não aceita número/);
});

test("proxy aceita aliases e redes explícitas", () => {
  assert.equal(trustProxyDaEnv("loopback"), "loopback");
  assert.deepEqual(trustProxyDaEnv("127.0.0.1, 10.0.0.0/8"), ["127.0.0.1", "10.0.0.0/8"]);
  assert.equal(trustProxyDaEnv("false"), false);
  assert.throws(() => trustProxyDaEnv("qualquer-coisa"), /inválido/);
});
