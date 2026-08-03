import { Client } from "ldapts";

// ============================================================================
// ACTIVE DIRECTORY
//
// A senha do usuário NUNCA é gravada nem trafega para lugar nenhum além do
// controlador de domínio: o `bind` é a própria validação. O portal não tem
// tabela de senha, não tem reset e não tem troca no primeiro acesso — quem
// manda na credencial é o AD. Desligou lá, perdeu o acesso aqui na hora.
//
// Adaptado de MenuBI/src/ldap.js, que já roda contra este domínio. Mantidos os
// mesmos nomes de variável para o .env poder ser o mesmo.
//
// .env (nunca commitado — PADRÃO §7):
//   LDAP_URL         ldaps://host:636
//   LDAP_BASE_DN     DC=exemplo,DC=local
//   LDAP_BIND_DN     conta de serviço só-leitura, para buscar usuários
//   LDAP_BIND_PASSWORD
// ============================================================================

const env = process.env;
const LDAP_URL = env.LDAP_URL || env.AD_URL;
const LDAP_BASE_DN = env.LDAP_BASE_DN || env.AD_BASE_DN || "";
const LDAP_SEARCH_BASE = env.LDAP_SEARCH_BASE || env.AD_SEARCH_BASE || LDAP_BASE_DN;
const LDAP_BIND_DN = env.LDAP_BIND_DN || env.AD_BIND_DN;
const LDAP_BIND_PASSWORD = env.LDAP_BIND_PASSWORD || env.AD_BIND_PASSWORD;
const LDAP_TLS_REJECT = env.LDAP_TLS_REJECT_UNAUTHORIZED || env.AD_TLS_REJECT_UNAUTHORIZED;

// Domínio para montar `usuario@dominio` quando a pessoa digita só o login.
// Deriva do bind DN em formato UPN ou do próprio base DN.
function dominioPadrao() {
  if (env.LDAP_DOMAIN || env.AD_DOMAIN) return env.LDAP_DOMAIN || env.AD_DOMAIN;
  if (LDAP_BIND_DN?.includes("@")) return LDAP_BIND_DN.split("@")[1];

  const partes = LDAP_BASE_DN.split(",")
    .map((item) => item.trim())
    .filter((item) => /^dc=/i.test(item))
    .map((item) => item.split("=")[1]);
  return partes.length ? partes.join(".") : null;
}

const DOMINIO = dominioPadrao();

// Contas desabilitadas no AD (bit ACCOUNTDISABLE) ficam de fora — é o que tira
// Guest, krbtgt e quem saiu da empresa.
const NAO_DESABILITADA = "(!(userAccountControl:1.2.840.113556.1.4.803:=2))";

export function configurado() {
  return Boolean(LDAP_URL);
}

export function buscaConfigurada() {
  return Boolean(LDAP_URL && LDAP_SEARCH_BASE && LDAP_BIND_DN && LDAP_BIND_PASSWORD);
}

function opcoes() {
  if (!LDAP_URL) {
    const erro = new Error("LDAP_URL não configurado no .env.");
    erro.status = 503;
    throw erro;
  }
  const opts = { url: LDAP_URL, timeout: 8000, connectTimeout: 8000 };
  // tlsOptions SÓ em ldaps://. Passar em ldap:// puro faz o DC derrubar a
  // conexão (ECONNRESET), o que parece indisponibilidade e não é.
  if (/^ldaps:/i.test(LDAP_URL)) {
    opts.tlsOptions = { rejectUnauthorized: LDAP_TLS_REJECT !== "false" };
  }
  return opts;
}

// Escapa valor usado em filtro LDAP. Sem isto, um login com `*` ou `(` vira
// filtro — é injeção de LDAP, o equivalente ao SQL injection.
export function escaparFiltro(valor) {
  return String(valor)
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

// O que o usuário digitou vira identidade de bind: aceita `login`,
// `login@dominio` e `DOMINIO\login`.
export function identidadeDeBind(usuario) {
  const texto = String(usuario ?? "").trim();
  if (!texto) return "";
  if (texto.includes("@") || texto.includes("\\")) return texto;
  return DOMINIO ? `${texto}@${DOMINIO}` : texto;
}

// Só o sAMAccountName, sem domínio, em minúsculo — é a chave em
// KING_IDENTIDADE_USUARIO.
export function normalizarLogin(usuario) {
  return String(usuario ?? "")
    .trim()
    .split("\\")
    .pop()
    .split("@")[0]
    .toLowerCase();
}

function primeiro(valor) {
  return Array.isArray(valor) ? valor[0] : valor;
}

// Valida a credencial no AD e devolve os dados do usuário.
// Lança em credencial inválida — quem chama traduz para mensagem genérica.
export async function autenticar(usuario, senha) {
  if (!usuario || !senha) {
    const erro = new Error("Usuário e senha são obrigatórios.");
    erro.status = 400;
    throw erro;
  }

  const cliente = new Client(opcoes());
  const identidade = identidadeDeBind(usuario);

  try {
    await cliente.bind(identidade, senha);

    // O bind já autenticou. A busca é só para pegar nome e e-mail; se falhar,
    // o login continua válido — negar acesso porque o diretório não respondeu a
    // uma consulta cosmética seria pior que entrar sem o nome bonito.
    let atributos = null;
    if (LDAP_SEARCH_BASE) {
      const login = escaparFiltro(normalizarLogin(usuario));
      const filtro = `(|(sAMAccountName=${login})(userPrincipalName=${escaparFiltro(identidade)}))`;
      try {
        const { searchEntries } = await cliente.search(LDAP_SEARCH_BASE, {
          scope: "sub",
          filter: filtro,
          attributes: ["sAMAccountName", "displayName", "mail"],
          sizeLimit: 1,
        });
        atributos = searchEntries[0] ?? null;
      } catch {
        atributos = null;
      }
    }

    const login = primeiro(atributos?.sAMAccountName) ?? normalizarLogin(usuario);
    return {
      login: String(login).toLowerCase(),
      nome: primeiro(atributos?.displayName) || login,
      email: primeiro(atributos?.mail) || (identidade.includes("@") ? identidade : null),
    };
  } finally {
    await cliente.unbind().catch(() => {});
  }
}

// Busca por trecho do nome ou do login, para o administrador achar quem
// cadastrar. Usa a conta de serviço, nunca a do usuário logado.
export async function buscarUsuarios(termo, limite = 20) {
  const texto = String(termo ?? "").trim();
  if (texto.length < 2) return [];

  if (!buscaConfigurada()) {
    const erro = new Error("Busca no AD não configurada (conta de serviço ausente no .env).");
    erro.status = 503;
    throw erro;
  }

  const cliente = new Client(opcoes());
  const alvo = escaparFiltro(texto);
  const filtro =
    `(&(objectCategory=person)(objectClass=user)${NAO_DESABILITADA}` +
    `(|(sAMAccountName=*${alvo}*)(displayName=*${alvo}*)(mail=*${alvo}*)))`;

  try {
    await cliente.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD);
    const { searchEntries } = await cliente.search(LDAP_SEARCH_BASE, {
      scope: "sub",
      filter: filtro,
      attributes: ["sAMAccountName", "displayName", "mail"],
      sizeLimit: limite,
    });

    return searchEntries
      .filter((entrada) => primeiro(entrada.sAMAccountName))
      .map((entrada) => ({
        login: String(primeiro(entrada.sAMAccountName)).toLowerCase(),
        nome: primeiro(entrada.displayName) || primeiro(entrada.sAMAccountName),
        email: primeiro(entrada.mail) || null,
      }))
      .slice(0, limite);
  } finally {
    await cliente.unbind().catch(() => {});
  }
}
