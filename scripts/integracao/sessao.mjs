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

  // --- limite de tentativas -----------------------------------------------
  // O unitário cobre limite.js; aqui o que se prova é o FIO: que `entrar()`
  // consulta o limite antes de chegar ao AD. Login inexistente de propósito —
  // gastar tentativas de um login real é exatamente o bloqueio de conta que
  // este limite existe para evitar.
  const { POR_LOGIN } = await import("../../server/limite.js");
  const alvo = "__nao.existe.limite";
  const tentar = () =>
    fetch(`${BASE}/api/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: alvo, senha: "errada" }),
    });

  const status = [];
  for (let i = 0; i < POR_LOGIN.tentativas + 1; i += 1) status.push((await tentar()).status);

  // Com o DC fora do ar tudo vira 503 e nada é contado — o que também é o
  // comportamento correto, então o teste reconhece esse caso em vez de falhar.
  if (status.every((s) => s === 503)) {
    console.log("  --  limite não exercitado: o AD não respondeu (503)");
  } else {
    ok(status.slice(0, POR_LOGIN.tentativas).every((s) => s === 401),
       `as ${POR_LOGIN.tentativas} primeiras tentativas chegam ao AD e voltam 401`);
    const ultima = await tentar();
    ok(ultima.status === 429, `passando do teto vira 429 (veio ${ultima.status})`);
    ok(Number(ultima.headers.get("retry-after")) > 0, "e diz em quantos segundos tentar de novo");
    ok(/\d+ min/.test((await ultima.json()).erro ?? ""), "a mensagem diz quanto esperar");

    // Outro login não pode ser atingido: senão bastaria errar cinco vezes para
    // travar o portal para todo mundo.
    const outro = await fetch(`${BASE}/api/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: "__nao.existe.outro", senha: "errada" }),
    });
    ok(outro.status !== 429, "o bloqueio é do login que errou, não dos outros");
  }
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
