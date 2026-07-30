import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  adicionarItem,
  campoDaDimensao,
  configuracaoInicial,
  filial,
  removerItem,
  renomearItem,
} from "../src/dados/configuracao.js";

test("configuração inicial traz filiais e centros", () => {
  const config = configuracaoInicial();
  assert.ok(config.filiais.length > 0);
  assert.ok(config.centros.length > 0);
});

test("configuração inicial não compartilha objeto entre chamadas", () => {
  // Sem a cópia, renomear em uma sessão vazaria para o seed do módulo.
  const a = configuracaoInicial();
  const b = configuracaoInicial();
  a.filiais[0].nome = "MUDADO";
  assert.notEqual(b.filiais[0].nome, "MUDADO");
});

test("campoDaDimensao só aceita os tipos conhecidos", () => {
  assert.equal(campoDaDimensao("filiais"), "filiais");
  assert.equal(campoDaDimensao("centros"), "centros");
  assert.equal(campoDaDimensao("canais"), null);
  assert.equal(campoDaDimensao(undefined), null);
});

test("adicionar, renomear e remover não mutam o original", () => {
  const original = configuracaoInicial();
  const quantidade = original.filiais.length;

  const comNova = adicionarItem(original, "filiais", { id: "x", nome: "Nova", fator: 0 });
  assert.equal(original.filiais.length, quantidade);
  assert.equal(comNova.filiais.length, quantidade + 1);

  const renomeada = renomearItem(comNova, "filiais", "x", "Outro nome");
  assert.equal(filial(comNova, "x").nome, "Nova");
  assert.equal(filial(renomeada, "x").nome, "Outro nome");

  const semNova = removerItem(renomeada, "filiais", "x");
  assert.equal(filial(semNova, "x"), null);
  assert.equal(semNova.filiais.length, quantidade);
});

test("tipo inválido devolve a configuração intacta", () => {
  const config = configuracaoInicial();
  assert.equal(adicionarItem(config, "canais", { id: "x", nome: "X" }), config);
  assert.equal(renomearItem(config, "canais", "x", "Y"), config);
  assert.equal(removerItem(config, "canais", "x"), config);
});

test("centros são independentes das filiais", () => {
  const config = configuracaoInicial();
  const semCentro = removerItem(config, "centros", config.centros[0].id);
  assert.equal(semCentro.filiais.length, config.filiais.length);
  assert.equal(semCentro.centros.length, config.centros.length - 1);
});
