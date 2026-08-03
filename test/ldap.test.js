import { strict as assert } from "node:assert";
import { test } from "node:test";

// O .env real não entra no teste: fixa o domínio antes de importar, porque o
// módulo lê o ambiente uma vez na carga.
process.env.LDAP_BASE_DN = "DC=exemplo,DC=local";
process.env.LDAP_URL = "ldaps://exemplo:636";

const { escaparFiltro, identidadeDeBind, normalizarLogin } = await import("../server/ldap.js");

// ---------------------------------------------------------------------------
// Escape de filtro
//
// Sem escape, um login com `*` ou `)` deixa de ser valor e vira filtro — é
// injeção de LDAP. `*` sozinho casaria com qualquer conta.
// ---------------------------------------------------------------------------

test("caracteres de filtro são escapados", () => {
  assert.equal(escaparFiltro("joao"), "joao");
  assert.equal(escaparFiltro("*"), "\\2a");
  assert.equal(escaparFiltro("a(b)c"), "a\\28b\\29c");
  assert.equal(escaparFiltro("a\\b"), "a\\5cb");
});

test("a barra é escapada antes dos parênteses", () => {
  // Ordem importa: escapar "(" primeiro geraria "\28" e a passagem seguinte
  // transformaria a barra dele em "\5c28", quebrando o valor.
  assert.equal(escaparFiltro("\\(") , "\\5c\\28");
});

test("tentativa de injeção vira texto", () => {
  const malicioso = "*)(objectClass=*";
  assert.equal(escaparFiltro(malicioso), "\\2a\\29\\28objectClass=\\2a");
  assert.ok(!escaparFiltro(malicioso).includes("(objectClass="));
});

// ---------------------------------------------------------------------------
// Identidade de bind
// ---------------------------------------------------------------------------

test("login simples ganha o domínio derivado do base DN", () => {
  assert.equal(identidadeDeBind("joao.silva"), "joao.silva@exemplo.local");
});

test("quem digita UPN ou DOMINIO\\usuario é respeitado", () => {
  assert.equal(identidadeDeBind("joao@outro.local"), "joao@outro.local");
  assert.equal(identidadeDeBind("EXEMPLO\\joao"), "EXEMPLO\\joao");
});

test("espaço em volta não vira parte do login", () => {
  assert.equal(identidadeDeBind("  joao.silva  "), "joao.silva@exemplo.local");
  assert.equal(identidadeDeBind(""), "");
});

// ---------------------------------------------------------------------------
// Login normalizado — é a chave em KING_IDENTIDADE_USUARIO
// ---------------------------------------------------------------------------

test("o login guardado é o sAMAccountName em minúsculo, sem domínio", () => {
  assert.equal(normalizarLogin("Joao.Silva"), "joao.silva");
  assert.equal(normalizarLogin("joao.silva@exemplo.local"), "joao.silva");
  assert.equal(normalizarLogin("EXEMPLO\\Joao.Silva"), "joao.silva");
  assert.equal(normalizarLogin("  joao.silva  "), "joao.silva");
});

test("as três formas de digitar chegam ao mesmo usuário", () => {
  // Senão a mesma pessoa viraria três cadastros e três conjuntos de permissão.
  const formas = ["joao.silva", "joao.silva@exemplo.local", "EXEMPLO\\joao.silva"];
  const logins = new Set(formas.map(normalizarLogin));
  assert.equal(logins.size, 1);
});

// ---------------------------------------------------------------------------
// Credencial recusada x canal quebrado
//
// Regressão que custou tempo real: com LDAPS mal configurado no controlador de
// domínio, TODO login respondia "usuário ou senha inválidos". A pessoa fica
// trocando a senha enquanto o problema é o certificado.
// ---------------------------------------------------------------------------

const { ehCredencialInvalida } = await import("../server/ldap.js");

test("só o código 49 do LDAP é credencial inválida", () => {
  assert.equal(ehCredencialInvalida({ code: 49 }), true);
  assert.equal(ehCredencialInvalida({ name: "InvalidCredentialsError" }), true);
});

test("falha de rede ou de TLS não é senha errada", () => {
  for (const erro of [
    { code: "ECONNRESET" },
    { code: "ECONNREFUSED" },
    { code: "ETIMEDOUT" },
    { code: "ENOTFOUND" },
    { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" },
    { code: "DEPTH_ZERO_SELF_SIGNED_CERT" },
  ]) {
    assert.equal(ehCredencialInvalida(erro), false, `${erro.code} não é credencial`);
  }
});

test("erro sem código nenhum não vira credencial inválida", () => {
  // Na dúvida, é problema de canal: dizer "senha errada" manda a pessoa para o
  // caminho errado e ainda gasta tentativa de bloqueio no AD.
  assert.equal(ehCredencialInvalida({}), false);
  assert.equal(ehCredencialInvalida(null), false);
  assert.equal(ehCredencialInvalida(new Error("boom")), false);
});
