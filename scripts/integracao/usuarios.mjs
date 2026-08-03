// Teste de integração: roda contra o KINGEJOE de verdade.
//   node --env-file=.env scripts/integracao/usuarios.mjs
// Fora de test/ de propósito: `node --test` varre aquela pasta inteira, e o
// `npm test` não pode depender de banco nem de rede.
// Cria e apaga os próprios registros, todos com prefixo `__t`.

process.env.API_PORT = "3416";
const BASE = "http://localhost:3416";
const { query, encerrar } = await import("../../server/sqlserver.js");
const { createHash, randomBytes } = await import("node:crypto");

const ADMIN = "__t.adm";
const ALVO = "__t.alvo";

async function limpar() {
  for (const l of [ADMIN, ALVO]) {
    await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @l", { l });
    await query("DELETE FROM dbo.KING_PORTAL_ORC_ACESSO WHERE LOGIN = @l", { l });
    await query("DELETE FROM dbo.KING_IDENTIDADE_ACESSO WHERE LOGIN = @l", { l });
    await query("DELETE FROM dbo.KING_IDENTIDADE_AUDITORIA WHERE LOGIN = @l", { l });
    await query("DELETE FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @l", { l });
  }
}

const falhas = [];
const ok = (cond, msg) => {
  if (!cond) falhas.push(msg);
  else console.log("  ok  " + msg);
};

await limpar();
await import("../../server/index.js");
await new Promise((r) => setTimeout(r, 700));

async function sessaoDe(login, admin) {
  await query("INSERT INTO dbo.KING_IDENTIDADE_USUARIO (LOGIN, NOME, ORIGEM) VALUES (@l, @l, 'manual')", { l: login });
  await query("INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, ADMIN) VALUES (@l, 'orcamento', @a)", { l: login, a: admin });
  const sid = randomBytes(32).toString("base64url");
  await query(
    "INSERT INTO dbo.KING_IDENTIDADE_SESSAO (SID_HASH, LOGIN, APP, EXPIRA_EM) VALUES (@h, @l, 'orcamento', DATEADD(hour, 8, SYSUTCDATETIME()))",
    { h: createHash("sha256").update(sid).digest("hex"), l: login }
  );
  return { cookie: "orcamento_sid=" + sid };
}

const req = (caminho, { cookie, metodo = "GET", corpo } = {}) =>
  fetch(BASE + caminho, {
    method: metodo,
    headers: { cookie, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

try {
  const admin = await sessaoDe(ADMIN, 1);
  const comum = await sessaoDe(ALVO, 0);

  ok((await req("/api/usuarios", comum)).status === 403, "não-admin não lista usuários");
  ok((await req("/api/usuarios", admin)).ok, "admin lista usuários");

  // Conceder e revogar
  await req(`/api/usuarios/${ALVO}/acessos`, {
    ...admin, metodo: "POST", corpo: { modulo: "", filial: "", centro: "020", podeEditar: true },
  });
  let lista = await (await req("/api/usuarios", admin)).json();
  let alvo = lista.find((u) => u.login === ALVO);
  ok(alvo.acessos.length === 1, "concessão aparece na lista");
  ok(alvo.acessos[0].centro === "020" && alvo.acessos[0].modulo === null,
     "campo vazio vira NULL, que vale por 'todos'");

  // Conceder a mesma combinação de novo não duplica, só atualiza.
  await req(`/api/usuarios/${ALVO}/acessos`, {
    ...admin, metodo: "POST", corpo: { modulo: "", filial: "", centro: "020", podeEditar: false },
  });
  lista = await (await req("/api/usuarios", admin)).json();
  alvo = lista.find((u) => u.login === ALVO);
  ok(alvo.acessos.length === 1 && alvo.acessos[0].podeEditar === false,
     "conceder de novo atualiza em vez de duplicar");

  // A sessão do alvo já enxerga a permissão nova.
  const suaSessao = await (await req("/api/sessao", comum)).json();
  ok(suaSessao.acessos.length === 1, "a permissão chega na sessão de quem a recebeu");

  await req(`/api/usuarios/${ALVO}/acessos/${alvo.acessos[0].id}`, { ...admin, metodo: "DELETE" });
  lista = await (await req("/api/usuarios", admin)).json();
  ok(lista.find((u) => u.login === ALVO).acessos.length === 0, "revogar tira a concessão");

  // Admin não pode se auto-remover: o portal ficaria sem quem administre.
  ok((await req(`/api/usuarios/${ADMIN}`, { ...admin, metodo: "DELETE" })).status === 400,
     "admin não remove o próprio acesso");

  // Remover derruba a sessão aberta do removido.
  await req(`/api/usuarios/${ALVO}`, { ...admin, metodo: "DELETE" });
  ok((await (await req("/api/sessao", comum)).json()) === null,
     "remover o acesso derruba a sessão que já estava aberta");
  ok((await req("/api/estado", comum)).status === 401, "e ele não alcança mais nada");
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
