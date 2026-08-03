import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { query, queryOne } from "./sqlserver.js";
import { autenticar, normalizarLogin } from "./ldap.js";
import { criarLimite } from "./limite.js";
import { conferir, criticarSenha, gerarHash } from "./senha.js";

// Hash de uma senha aleatória que ninguém sabe, conferido quando o login não
// existe. Serve só para gastar o mesmo tempo: sem ele, login inexistente
// responde na hora e login real depois de ~100ms de scrypt, e essa diferença
// permite descobrir quem tem conta aqui sem acertar senha nenhuma.
const HASH_FANTASMA = await gerarHash(randomBytes(32).toString("hex"));

// ============================================================================
// IDENTIDADE E SESSÃO
//
// Cadastro compartilhado entre os portais AKR (KING_IDENTIDADE_*) e as
// permissões deste portal (KING_PORTAL_ORC_ACESSO).
//
// A autenticação tem duas portas, e qual vale depende de a pessoa já ter senha
// no portal:
//
//   SEM senha  →  entra com a do Windows (bind no AD) e define a do portal na
//                 hora. É o primeiro acesso, e é o que dispensa alguém ter que
//                 distribuir senha inicial.
//   COM senha  →  o AD não é mais consultado para esta conta.
//
// A senha do portal nunca é guardada em texto: o que fica é scrypt com sal
// (server/senha.js).
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
    `SELECT s.LOGIN, s.EXPIRA_EM, u.NOME, u.SITUACAO, u.TROCAR_SENHA,
            CASE WHEN u.SENHA_HASH IS NULL THEN 1 ELSE 0 END AS SEM_SENHA
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

  const sessao = await montarSessao(linha.LOGIN, linha.NOME);

  // A troca pendente viaja na sessão em vez de ser consultada pela tela: assim
  // ela sobrevive a um F5 e o front não tem como esquecer de perguntar.
  const primeiroAcesso = linha.SEM_SENHA === 1 || linha.SEM_SENHA === true;
  return (
    sessao && {
      ...sessao,
      trocarSenha: primeiroAcesso || linha.TROCAR_SENHA === true,
      primeiroAcesso,
    }
  );
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

// O limite vive no módulo, não na rota: assim nenhum caminho de código chega ao
// AD nem à conferência de senha sem passar por ele.
//
// Ele protege as duas portas, por motivos diferentes: no primeiro acesso,
// impede que o portal dispare a política de bloqueio de conta do AD; depois,
// é o único freio contra adivinhação, já que a senha do portal não tem bloqueio
// nenhum atrás dela.
const limite = criarLimite();

export async function entrar({ usuario, senha, ip, userAgent, res }) {
  const negar = () => {
    const erro = new Error("Usuário ou senha inválidos.");
    erro.status = 401;
    return erro;
  };

  const login = normalizarLogin(usuario);
  const origem = ip ?? "?";

  const espera = limite.esperaRestante(login, origem);
  if (espera > 0) {
    await registrar({ login, evento: "negado", detalhe: "excesso de tentativas", ip });
    const erro = new Error(
      `Tentativas demais. Espere ${Math.ceil(espera / 60_000)} min e tente de novo.`
    );
    erro.status = 429;
    erro.retryApos = Math.ceil(espera / 1000);
    throw erro;
  }

  const cadastro = login
    ? await queryOne(
        `SELECT LOGIN, NOME, SENHA_HASH, TROCAR_SENHA, SITUACAO
           FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @login`,
        { login }
      )
    : null;

  // Login que não existe nunca chega ao AD: consultar o diretório para qualquer
  // nome digitado transformaria o formulário num descobridor de contas e, pior,
  // gastaria tentativa de bloqueio de conta de gente que nem usa o portal.
  // O hash descartável iguala o tempo de resposta — sem ele, "não existe" volta
  // na hora e "existe" volta depois do scrypt, e o intervalo entrega a lista de
  // quem trabalha aqui.
  if (!cadastro) {
    await conferir(senha ?? "", HASH_FANTASMA);
    limite.registrarFalha(login, origem);
    await registrar({ login, evento: "negado", detalhe: "login inexistente", ip });
    throw negar();
  }

  // Duas portas, e qual vale depende de a pessoa já ter senha no portal:
  //
  //   SEM senha  →  entra com a do Windows (bind no AD) e é obrigada a definir
  //                 a do portal na hora. É assim que o primeiro acesso funciona
  //                 sem ninguém precisar distribuir senha.
  //   COM senha  →  o AD não é mais consultado. Daí em diante a senha do portal
  //                 é a única que abre esta conta.
  const primeiroAcesso = !cadastro.SENHA_HASH;

  if (primeiroAcesso) {
    try {
      await autenticar(usuario, senha);
    } catch (erro) {
      // 503 é o DC fora do ar ou mal configurado: precisa aparecer como tal, e
      // não conta como tentativa — o serviço caído não é ninguém errando senha.
      if (erro.status === 503) throw erro;
      limite.registrarFalha(login, origem);
      await registrar({ login, evento: "negado", detalhe: "ad", ip });
      throw negar();
    }
  } else if (!(await conferir(senha ?? "", cadastro.SENHA_HASH))) {
    limite.registrarFalha(login, origem);
    await registrar({ login, evento: "negado", detalhe: "senha", ip });
    throw negar();
  }

  if (cadastro.SITUACAO !== "ativo") {
    await registrar({ login, evento: "negado", detalhe: "cadastro inativo", ip });
    const erro = new Error("Seu acesso está inativo. Procure um administrador.");
    erro.status = 403;
    throw erro;
  }

  limite.registrarAcerto(cadastro.LOGIN);

  const sessao = await montarSessao(cadastro.LOGIN, cadastro.NOME);

  if (!sessao) {
    await registrar({ login: cadastro.LOGIN, evento: "negado", detalhe: "sem acesso ao portal", ip });
    const erro = new Error("Você não tem acesso ao Planejamento Orçamentário.");
    erro.status = 403;
    throw erro;
  }

  await query(
    "UPDATE dbo.KING_IDENTIDADE_USUARIO SET ULTIMO_LOGIN = SYSUTCDATETIME() WHERE LOGIN = @login",
    { login: cadastro.LOGIN }
  ).catch(() => {});

  const id = await criarSessao(cadastro.LOGIN, { ip, userAgent });
  gravarCookie(res, id);
  await registrar({ login: cadastro.LOGIN, evento: "login", ip });

  // A sessão nasce válida mesmo com troca pendente: sem ela a tela de troca não
  // teria como se autenticar para trocar. Quem barra o resto é `exigirSessao`.
  return { ...sessao, trocarSenha: primeiroAcesso || cadastro.TROCAR_SENHA === true, primeiroAcesso };
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
  if (!req.sessao) {
    const erro = new Error("Sessão expirada. Entre novamente.");
    erro.status = 401;
    return next(erro);
  }

  // Troca pendente tranca o portal inteiro, não só a tela. Sem isto, quem
  // recebeu a primeira senha poderia usar o sistema para sempre sem trocá-la,
  // bastando ignorar o formulário — e a senha que circulou por e-mail ou
  // WhatsApp continuaria valendo.
  if (req.sessao.trocarSenha) {
    const erro = new Error("Defina uma senha nova para continuar.");
    erro.status = 428; // Precondition Required
    return next(erro);
  }

  next();
}

// --------------------------------------------------------------------------
// Trocar a senha
// --------------------------------------------------------------------------

export async function trocarSenha({ login, senhaAtual, senhaNova, ip, sessaoAtual }) {
  const cadastro = await queryOne(
    "SELECT LOGIN, NOME, SENHA_HASH FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @login",
    { login }
  );

  if (!cadastro) {
    const erro = new Error("Usuário não encontrado.");
    erro.status = 404;
    throw erro;
  }

  // Exige a senha atual mesmo já estando logado: sem isso, uma sessão deixada
  // aberta numa máquina vira troca de senha e sequestro da conta.
  //
  // Quem ainda não tem senha no portal confirma com a do Windows — a mesma com
  // que acabou de entrar. Simétrico com `entrar()`: quem manda é ter ou não ter
  // senha no portal.
  const conferiu = cadastro.SENHA_HASH
    ? await conferir(senhaAtual ?? "", cadastro.SENHA_HASH)
    : await autenticar(login, senhaAtual ?? "").then(
        () => true,
        (erro) => {
          if (erro.status === 503) throw erro;
          return false;
        }
      );

  if (!conferiu) {
    await registrar({ login, evento: "negado", detalhe: "troca de senha: atual errada", ip });
    const erro = new Error(
      cadastro.SENHA_HASH ? "A senha atual está errada." : "A senha do Windows está errada."
    );
    erro.status = 401;
    throw erro;
  }

  const critica = criticarSenha(senhaNova, { login, nome: cadastro.NOME });
  if (critica) {
    const erro = new Error(critica);
    erro.status = 400;
    throw erro;
  }

  if (await conferir(senhaNova, cadastro.SENHA_HASH)) {
    const erro = new Error("A senha nova precisa ser diferente da atual.");
    erro.status = 400;
    throw erro;
  }

  await query(
    `UPDATE dbo.KING_IDENTIDADE_USUARIO
        SET SENHA_HASH = @hash, TROCAR_SENHA = 0, ATUALIZADO_EM = SYSUTCDATETIME()
      WHERE LOGIN = @login`,
    { login, hash: await gerarHash(senhaNova) }
  );

  // Derruba as OUTRAS sessões: trocar a senha é o que se faz quando se
  // desconfia que alguém entrou, e de nada adianta se a sessão dele continua de
  // pé até expirar.
  await query(
    "DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @login AND SID_HASH <> @atual",
    { login, atual: hashDoId(sessaoAtual ?? "") }
  ).catch(() => {});

  await registrar({ login, evento: "senha-alterada", ip });
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
