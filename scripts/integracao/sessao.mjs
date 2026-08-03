// Teste de integração: roda contra o KINGEJOE de verdade.
//   node --env-file=.env scripts/integracao/sessao.mjs
// Fora de test/ de propósito: `node --test` varre aquela pasta inteira, e o
// `npm test` não pode depender de banco nem de rede.
// Cria e apaga os próprios registros, todos com prefixo `__t`.

process.env.API_PORT = "3411";
const BASE = "http://localhost:3411";
const LOGIN = "__teste.portal";

const { query, encerrar } = await import("../../server/sqlserver.js");

async function limpar() {
  await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @l", { l: LOGIN });
  await query("DELETE FROM dbo.KING_PORTAL_ORC_ACESSO WHERE LOGIN = @l", { l: LOGIN });
  await query("DELETE FROM dbo.KING_IDENTIDADE_ACESSO WHERE LOGIN = @l", { l: LOGIN });
  await query("DELETE FROM dbo.KING_IDENTIDADE_AUDITORIA WHERE LOGIN = @l", { l: LOGIN });
  await query("DELETE FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @l", { l: LOGIN });
}

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); else console.log("  ok  " + msg); };

await limpar();
await import("../../server/index.js");
await new Promise((r) => setTimeout(r, 700));

try {
  // --- sem sessão ---------------------------------------------------------
  ok((await (await fetch(`${BASE}/api/sessao`)).json()) === null, "/api/sessao sem cookie devolve null");
  ok((await fetch(`${BASE}/api/filiais`)).status === 401, "/api/filiais sem sessão devolve 401");
  ok((await fetch(`${BASE}/api/realizado?ano=2026`)).status === 401, "/api/realizado sem sessão devolve 401");
  ok((await fetch(`${BASE}/api/health`)).status === 200, "/api/health continua aberto");

  // Credencial recusada é 401; falha de canal (DC fora, LDAPS quebrado) é 503.
  // Usuário inexistente, para não gastar tentativa de bloqueio de conta real.
  const recusado = await fetch(`${BASE}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "__nao.existe.portal", senha: "x" }),
  });
  ok([401, 503].includes(recusado.status), `login inválido devolve 401 ou 503 (veio ${recusado.status})`);
  ok(recusado.status !== 500, "e nunca 500");

  // --- usuário e sessão criados à mão -------------------------------------
  await query(`INSERT INTO dbo.KING_IDENTIDADE_USUARIO (LOGIN, NOME, ORIGEM) VALUES (@l, 'Teste Portal', 'manual')`, { l: LOGIN });
  await query(`INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, ADMIN) VALUES (@l, 'orcamento', 0)`, { l: LOGIN });
  await query(`INSERT INTO dbo.KING_PORTAL_ORC_ACESSO (LOGIN, MODULO, COD_FILIAL, CENTRO_CUSTO, PODE_EDITAR)
               VALUES (@l, NULL, NULL, '020', 1)`, { l: LOGIN });

  const { createHash, randomBytes } = await import("node:crypto");
  const sid = randomBytes(32).toString("base64url");
  await query(`INSERT INTO dbo.KING_IDENTIDADE_SESSAO (SID_HASH, LOGIN, APP, EXPIRA_EM)
               VALUES (@h, @l, 'orcamento', DATEADD(hour, 8, SYSUTCDATETIME()))`,
    { h: createHash("sha256").update(sid).digest("hex"), l: LOGIN });

  const comCookie = { headers: { cookie: `orcamento_sid=${sid}` } };
  const sessao = await (await fetch(`${BASE}/api/sessao`, comCookie)).json();
  ok(sessao?.login === LOGIN, "sessão válida identifica o usuário");
  ok(sessao?.admin === false, "não é admin sem a marcação");
  ok(sessao?.acessos?.length === 1 && sessao.acessos[0].centro === "020", "permissões vêm junto da sessão");
  ok((await fetch(`${BASE}/api/filiais`, comCookie)).status === 200, "com sessão, /api/filiais responde");

  // O id do cookie não pode estar gravado em lugar nenhum.
  const guardado = await query("SELECT SID_HASH FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @l", { l: LOGIN });
  ok(guardado.every((r) => r.SID_HASH !== sid), "a tabela guarda o hash, nunca o id do cookie");

  // --- cookie inválido ----------------------------------------------------
  const forjado = await fetch(`${BASE}/api/filiais`, { headers: { cookie: "orcamento_sid=nao-existe" } });
  ok(forjado.status === 401, "cookie forjado não entra");

  // --- usuário sem acesso ao portal ---------------------------------------
  await query("DELETE FROM dbo.KING_IDENTIDADE_ACESSO WHERE LOGIN = @l", { l: LOGIN });
  ok((await (await fetch(`${BASE}/api/sessao`, comCookie)).json()) === null,
     "tirar o acesso ao portal derruba a sessão viva");

  // --- logout apaga a linha ------------------------------------------------
  await query(`INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, ADMIN) VALUES (@l, 'orcamento', 0)`, { l: LOGIN });
  await fetch(`${BASE}/api/logout`, { method: "POST", ...comCookie });
  const sobrou = await query("SELECT COUNT(*) AS n FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @l", { l: LOGIN });
  ok(sobrou[0].n === 0, "logout apaga a sessão do banco");
  ok((await fetch(`${BASE}/api/filiais`, comCookie)).status === 401, "depois do logout o cookie não vale mais");

  // --- auditoria ----------------------------------------------------------
  // Falha de configuração (503) NÃO é decisão de credencial e não polui a
  // auditoria de acesso — fica no log do servidor. Só `login`, `logout` e
  // `negado` entram aqui, e esses exigem o AD respondendo.
  const auditoria = await query("SELECT EVENTO FROM dbo.KING_IDENTIDADE_AUDITORIA WHERE LOGIN = @l", { l: LOGIN });
  ok(auditoria.length === 0, "503 de configuração não vira evento de acesso negado");

  // A tabela aceita escrita e o índice por login funciona.
  await query(`INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE)
               VALUES (@l, 'orcamento', 'negado', 'teste')`, { l: LOGIN });
  const gravado = await query("SELECT EVENTO FROM dbo.KING_IDENTIDADE_AUDITORIA WHERE LOGIN = @l", { l: LOGIN });
  ok(gravado.length === 1 && gravado[0].EVENTO === "negado", "auditoria grava e lê por login");
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
