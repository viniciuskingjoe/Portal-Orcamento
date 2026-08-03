import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conferir, criticarSenha, gerarHash, sortearSenha, TAMANHO_MINIMO } from "../server/senha.js";

describe("hash de senha", () => {
  it("a senha certa confere e a errada não", async () => {
    const hash = await gerarHash("uma-senha-qualquer-99");
    assert.equal(await conferir("uma-senha-qualquer-99", hash), true);
    assert.equal(await conferir("uma-senha-qualquer-98", hash), false);
  });

  it("a senha não aparece no que é guardado", async () => {
    const hash = await gerarHash("batata-frita-2026");
    assert.ok(!hash.includes("batata"));
  });

  // Sem sal, duas pessoas com a mesma senha teriam o mesmo hash, e um vazamento
  // se resolveria com tabela pronta.
  it("a mesma senha gera hashes diferentes", async () => {
    const [a, b] = await Promise.all([gerarHash("mesma-senha-aqui"), gerarHash("mesma-senha-aqui")]);
    assert.notEqual(a, b);
    assert.equal(await conferir("mesma-senha-aqui", a), true);
    assert.equal(await conferir("mesma-senha-aqui", b), true);
  });

  it("cabe no VARCHAR(200) da coluna", async () => {
    assert.ok((await gerarHash("x".repeat(200))).length <= 200);
  });

  it("hash corrompido ou de outro formato não deixa entrar", async () => {
    for (const invalido of ["", null, "lixo", "s1:só:duas", "s9:1:2:3:ab:cd", "$2b$10$algodobcrypt"]) {
      assert.equal(await conferir("qualquer-coisa", invalido), false);
    }
  });

  it("senha vazia nunca confere, nem contra hash válido", async () => {
    assert.equal(await conferir("", await gerarHash("alguma-senha-real")), false);
  });
});

describe("força da senha", () => {
  const contexto = { login: "vinicius.lopes", nome: "Vinicius Lopes" };

  it("aceita senha comum e boa", () => {
    for (const boa of ["umaSenhaBoaAqui99", "Chuva-Azul-2026", "cavalo bateria grampo"]) {
      assert.equal(criticarSenha(boa, contexto), null, boa);
    }
  });

  it("exige o tamanho mínimo", () => {
    assert.match(criticarSenha("a".repeat(TAMANHO_MINIMO - 1), contexto), /10 caracteres/);
  });

  it("recusa a palavra óbvia com número no fim", () => {
    for (const ruim of ["senha123456", "Portal@2026", "orcamento2026", "admin12345"]) {
      assert.ok(criticarSenha(ruim, contexto), ruim);
    }
  });

  // A palavra pode aparecer DENTRO de uma senha boa — recusar por substring
  // barraria "umaSenhaBoaAqui99", que não tem nada de fraca.
  it("não recusa só por conter a palavra no meio", () => {
    assert.equal(criticarSenha("umaSenhaBoaAqui99", contexto), null);
  });

  it("recusa a senha padrão que já circulou", () => {
    assert.ok(criticarSenha("king@123456", contexto));
  });

  it("recusa o próprio login e o próprio nome", () => {
    assert.match(criticarSenha("vinicius.lopes99", contexto), /login/);
    assert.match(criticarSenha("Vinicius2026!!", contexto), /nome/);
  });

  it("recusa repetição demais", () => {
    assert.ok(criticarSenha("abababababab", contexto));
  });

  it("recusa espaço nas pontas, que some ao copiar e colar", () => {
    assert.ok(criticarSenha(" senha boa aqui ", contexto));
  });

  it("sem contexto de usuário continua funcionando", () => {
    assert.equal(criticarSenha("Chuva-Azul-2026"), null);
  });
});

describe("senha sorteada (scripts/definir-senha.mjs)", () => {
  it("passa nas próprias regras de força", () => {
    for (let i = 0; i < 50; i += 1) {
      const senha = sortearSenha();
      assert.equal(criticarSenha(senha, { login: "fulano", nome: "Fulano" }), null, senha);
    }
  });

  it("não repete", () => {
    const sorteadas = new Set(Array.from({ length: 200 }, () => sortearSenha()));
    assert.equal(sorteadas.size, 200);
  });

  // Vai ser lida em voz alta ou copiada a mão: 0/O e 1/l/I são a causa mais
  // comum de "a senha não funciona".
  it("não usa caracteres que se confundem", () => {
    for (let i = 0; i < 50; i += 1) {
      assert.doesNotMatch(sortearSenha(), /[0O1lI]/);
    }
  });
});
