import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { criarLimite, POR_LOGIN, POR_ORIGEM } from "../server/limite.js";

// Relógio injetado: o limite é sobre tempo, e teste que espera tempo de verdade
// é teste lento e instável.
function comRelogio() {
  let instante = 1_700_000_000_000;
  const limite = criarLimite({ agora: () => instante });
  return { limite, avancar: (ms) => (instante += ms) };
}

const errar = (limite, vezes, login = "fulano", origem = "10.0.0.1") => {
  for (let i = 0; i < vezes; i += 1) limite.registrarFalha(login, origem);
};

describe("limite de tentativas", () => {
  it("deixa passar enquanto está abaixo do teto", () => {
    const { limite } = comRelogio();
    errar(limite, POR_LOGIN.tentativas - 1);
    assert.equal(limite.esperaRestante("fulano", "10.0.0.1"), 0);
  });

  it("bloqueia o login ao atingir o teto", () => {
    const { limite } = comRelogio();
    errar(limite, POR_LOGIN.tentativas);
    assert.equal(limite.esperaRestante("fulano", "10.0.0.1"), POR_LOGIN.espera);
  });

  it("solta sozinho quando a espera passa", () => {
    const { limite, avancar } = comRelogio();
    errar(limite, POR_LOGIN.tentativas);
    avancar(POR_LOGIN.espera + 1);
    assert.equal(limite.esperaRestante("fulano", "10.0.0.1"), 0);
  });

  it("bloqueia só quem errou, não os outros", () => {
    const { limite } = comRelogio();
    errar(limite, POR_LOGIN.tentativas, "fulano");
    assert.equal(limite.esperaRestante("beltrano", "10.0.0.1"), 0);
  });

  it("senha certa zera o contador do login", () => {
    const { limite } = comRelogio();
    errar(limite, POR_LOGIN.tentativas - 1);
    limite.registrarAcerto("fulano");
    errar(limite, POR_LOGIN.tentativas - 1);
    assert.equal(limite.esperaRestante("fulano", "10.0.0.1"), 0);
  });

  it("falha antiga não soma com falha nova: a janela expira", () => {
    const { limite, avancar } = comRelogio();
    errar(limite, POR_LOGIN.tentativas - 1);
    avancar(POR_LOGIN.janela + 1);
    errar(limite, POR_LOGIN.tentativas - 1);
    assert.equal(limite.esperaRestante("fulano", "10.0.0.1"), 0);
  });

  // O ponto do limite: a tentativa nem chega ao AD, então o contador de bloqueio
  // de lá não sobe. Muitas tentativas seguidas continuam presas.
  it("insistir durante o bloqueio não fura o bloqueio", () => {
    const { limite } = comRelogio();
    errar(limite, POR_LOGIN.tentativas * 4);
    assert.ok(limite.esperaRestante("fulano", "10.0.0.1") > 0);
  });
});

describe("limite por origem", () => {
  it("conta logins distintos, não tentativas", () => {
    const { limite } = comRelogio();
    // Uma pessoa só, insistindo muito além do teto de origem: não pode derrubar
    // a origem inteira. Atrás de NAT isso seria a empresa toda.
    errar(limite, POR_ORIGEM.logins * 2, "fulano", "10.0.0.1");
    limite.registrarAcerto("fulano");
    assert.equal(limite.esperaRestante("beltrano", "10.0.0.1"), 0);
  });

  it("bloqueia a origem que varre muitos logins", () => {
    const { limite } = comRelogio();
    for (let i = 0; i < POR_ORIGEM.logins; i += 1) {
      limite.registrarFalha(`usuario${i}`, "10.0.0.9");
    }
    assert.equal(limite.esperaRestante("outro", "10.0.0.9"), POR_ORIGEM.espera);
  });

  it("varredura de uma origem não afeta outra", () => {
    const { limite } = comRelogio();
    for (let i = 0; i < POR_ORIGEM.logins; i += 1) {
      limite.registrarFalha(`usuario${i}`, "10.0.0.9");
    }
    assert.equal(limite.esperaRestante("alguem", "10.0.0.1"), 0);
  });
});

describe("memória", () => {
  it("não cresce sem limite: registro vencido some", () => {
    const { limite, avancar } = comRelogio();
    for (let i = 0; i < 50; i += 1) limite.registrarFalha(`usuario${i}`, `10.0.0.${i}`);
    const antes = limite.tamanho();

    avancar(Math.max(POR_LOGIN.espera, POR_ORIGEM.espera) + POR_ORIGEM.janela + 1);
    limite.registrarFalha("gatilho", "10.0.1.1");

    assert.ok(limite.tamanho() < antes, `esperava encolher, foi de ${antes} para ${limite.tamanho()}`);
  });
});
