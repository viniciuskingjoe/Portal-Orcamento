import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { query, queryOne } from "./sqlserver.js";
import { autenticar, normalizarLogin } from "./ldap.js";

// ============================================================================
// IDENTIDADE E SESSÃO
//
// Cadastro compartilhado entre os portais AKR (KING_IDENTIDADE_*) e as
// permissões deste portal (KING_PORTAL_ORC_ACESSO).
//
// A senha não passa por aqui: quem valida é o AD, por bind. Este módulo só
// resolve "quem é" e "o que pode".
// ============================================================================

const APP = "orcamento";
const HORAS_DE_SESSAO = 8;

// Quem entra como administrador mesmo sem linha na tabela. Sem isto ninguém
// consegue conceder a primeira permissão — não há como criar o primeiro admin
// pela tela, porque a tela exige ser admin.
function adminsDoEnv() {
  return new Set(
    (process.env.PORTAL_ADMINS ?? "")
      .split(",")
      .map((item) => normalizarLogin(item))
      .filter(Boolean)
  );
}

// --------------------------------------------------------------------------
// Sessão
//
// O que vai no cookie é o id sorteado; o que fica gravado é o SHA-256 dele.
// Assim um backup, um dump ou uma consulta de suporte não entregam sessão viva
// a ninguém. Comparação por hash também é imune a timing.
// --------------------------------------------------------------------------

const COOKIE = "orcamento_sid";

function hashDoId(id) {
  return createHash("sha256").update(String(id)).digest("hex");
}

export function cookieDaRequisicao(req) {
  const bruto = req.headers?.cookie;
  if (!bruto) return null;

  for (const parte of bruto.split(";")) {
    const corte = parte.indexOf("=");
    if (corte < 0) continue;
    if (parte.slice(0, corte).trim() === COOKIE) {
      return decodeURIComponent(parte.slice(corte + 1).trim());
    }
  }
  return null;
}

export function gravarCookie(res, id) {
  res.cookie(COOKIE, id, {
    httpOnly: true, // JavaScript da página não lê: XSS não rouba a sessão
    sameSite: "lax", // corta CSRF nas navegações de terceiros
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HORAS_DE_SESSAO * 3600 * 1000,
  });
}

export function limparCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

async function criarSessao(login, { ip, userAgent }) {
  const id = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + HORAS_DE_SESSAO * 3600 * 1000);

  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_SESSAO
       (SID_HASH, LOGIN, APP, EXPIRA_EM, IP, USER_AGENT)
     VALUES (@hash, @login, @app, @expira, @ip, @agente)`,
    {
      hash: hashDoId(id),
      login,
      app: APP,
      expira,
      ip: ip ?? null,
      agente: userAgent ? String(userAgent).slice(0, 300) : null,
    }
  );

  return id;
}

export async function encerrarSessao(id) {
  if (!id) return;
  await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE SID_HASH = @hash", {
    hash: hashDoId(id),
  });
}

// Sessão expirada é apagada na leitura: sem uma rotina de limpeza, a tabela só
// cresce e a expiração vira só uma coluna que ninguém honra.
export async function sessaoDoCookie(id) {
  if (!id) return null;
  const hash = hashDoId(id);

  const linha = await queryOne(
    `SELECT s.LOGIN, s.EXPIRA_EM, u.NOME, u.SITUACAO
       FROM dbo.KING_IDENTIDADE_SESSAO AS s
       INNER JOIN dbo.KING_IDENTIDADE_USUARIO AS u ON u.LOGIN = s.LOGIN
      WHERE s.SID_HASH = @hash AND s.APP = @app`,
    { hash, app: APP }
  );

  if (!linha) return null;
  if (new Date(linha.EXPIRA_EM) <= new Date() || linha.SITUACAO !== "ativo") {
    await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE SID_HASH = @hash", { hash });
    return null;
  }

  // Renova a validade a cada uso: quem está trabalhando não é deslogado no meio.
  await query(
    `UPDATE dbo.KING_IDENTIDADE_SESSAO
        SET VISTA_EM = SYSUTCDATETIME(), EXPIRA_EM = @expira
      WHERE SID_HASH = @hash`,
    { hash, expira: new Date(Date.now() + HORAS_DE_SESSAO * 3600 * 1000) }
  );

  return montarSessao(linha.LOGIN, linha.NOME);
}

// --------------------------------------------------------------------------
// Quem é e o que pode
// --------------------------------------------------------------------------

async function montarSessao(login, nome) {
  const acessoApp = await queryOne(
    `SELECT ADMIN, SITUACAO FROM dbo.KING_IDENTIDADE_ACESSO
      WHERE LOGIN = @login AND APP = @app`,
    { login, app: APP }
  );

  const admin = adminsDoEnv().has(login) || acessoApp?.ADMIN === true;
  if (!admin && (!acessoApp || acessoApp.SITUACAO !== "ativo")) return null;

  const acessos = await query(
    `SELECT MODULO, COD_FILIAL, CENTRO_CUSTO, PODE_EDITAR
       FROM dbo.KING_PORTAL_ORC_ACESSO WHERE LOGIN = @login`,
    { login }
  );

  return {
    login,
    nome: nome ?? login,
    admin,
    acessos: acessos.map((linha) => ({
      modulo: linha.MODULO,
      filial: linha.COD_FILIAL,
      centro: linha.CENTRO_CUSTO,
      podeEditar: linha.PODE_EDITAR === true,
    })),
  };
}

// Cria ou atualiza o cadastro com o que veio do AD. O AD é a fonte de nome e
// e-mail; permissão é do portal e não é tocada aqui.
async function sincronizarUsuario({ login, nome, email }) {
  await query(
    `MERGE dbo.KING_IDENTIDADE_USUARIO AS destino
     USING (SELECT @login AS LOGIN) AS origem ON destino.LOGIN = origem.LOGIN
     WHEN MATCHED THEN UPDATE SET
       NOME = @nome, EMAIL = @email,
       ATUALIZADO_EM = SYSUTCDATETIME(), ULTIMO_LOGIN = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (LOGIN, NOME, EMAIL, ORIGEM, ULTIMO_LOGIN)
       VALUES (@login, @nome, @email, 'ad', SYSUTCDATETIME());`,
    { login, nome, email: email ?? null }
  );
}

async function registrar({ login, evento, detalhe, ip }) {
  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE, IP)
     VALUES (@login, @app, @evento, @detalhe, @ip)`,
    { login: login ?? null, app: APP, evento, detalhe: detalhe ?? null, ip: ip ?? null }
  ).catch(() => {}); // auditoria não pode derrubar login
}

// --------------------------------------------------------------------------
// Entrar
//
// Erro sempre genérico: distinguir "não existe" de "senha errada" entrega a
// lista de quem trabalha aqui a quem estiver tentando.
// --------------------------------------------------------------------------

export async function entrar({ usuario, senha, ip, userAgent, res }) {
  const negar = () => {
    const erro = new Error("Usuário ou senha inválidos.");
    erro.status = 401;
    return erro;
  };

  let doAd;
  try {
    doAd = await autenticar(usuario, senha);
  } catch (erro) {
    // 503 é falha de configuração/rede: precisa aparecer como tal, senão o
    // suporte procura senha errada onde o problema é o certificado do DC.
    if (erro.status === 503) throw erro;
    await registrar({ login: normalizarLogin(usuario), evento: "negado", detalhe: "ad", ip });
    throw negar();
  }

  await sincronizarUsuario(doAd);
  const sessao = await montarSessao(doAd.login, doAd.nome);

  if (!sessao) {
    await registrar({ login: doAd.login, evento: "negado", detalhe: "sem acesso ao portal", ip });
    const erro = new Error("Você não tem acesso ao Planejamento Orçamentário.");
    erro.status = 403;
    throw erro;
  }

  const id = await criarSessao(doAd.login, { ip, userAgent });
  gravarCookie(res, id);
  await registrar({ login: doAd.login, evento: "login", ip });

  return sessao;
}

// --------------------------------------------------------------------------
// Middleware
// --------------------------------------------------------------------------

export function comSessao() {
  return async (req, _res, next) => {
    try {
      req.sessao = await sessaoDoCookie(cookieDaRequisicao(req));
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

export function exigirSessao(req, _res, next) {
  if (req.sessao) return next();
  const erro = new Error("Sessão expirada. Entre novamente.");
  erro.status = 401;
  next(erro);
}

export function exigirAdmin(req, _res, next) {
  if (req.sessao?.admin) return next();
  const erro = new Error("Ação restrita a administradores.");
  erro.status = 403;
  next(erro);
}

// Comparação de token em tempo constante, para os pontos onde o valor vem do
// cliente e é comparado com um segredo do servidor.
export function iguais(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
}
