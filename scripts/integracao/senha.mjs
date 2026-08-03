// Teste de integração: roda contra o KINGEJOE de verdade.
//   node --env-file=.env scripts/integracao/senha.mjs
// Fora de test/ de propósito: `node --test` varre aquela pasta inteira, e o
// `npm test` não pode depender de banco nem de rede.
// Cria e apaga os próprios registros, todos com prefixo `__t`.

process.env.API_PORT = "3417";
const BASE = "http://127.0.0.1:3417";
const { query, encerrar } = await import("../../server/sqlserver.js");
const { gerarHash } = await import("../../server/senha.js");

const ADMIN = "__t.senha.adm";
const ALVO = "__t.senha.alvo";
const SENHA_ADMIN = "administrador-forte-77";

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

const req = (caminho, { cookie, metodo = "GET", corpo } = {}) =>
  fetch(BASE + caminho, {
    method: metodo,
    headers: { cookie, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

const cookieDe = (resposta) => (resposta.headers.get("set-cookie") ?? "").split(";")[0];

try {
  // Um admin com senha já definida, para exercitar as rotas de administração.
  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_USUARIO (LOGIN, NOME, ORIGEM, SENHA_HASH, TROCAR_SENHA)
     VALUES (@l, 'Admin de Teste', 'manual', @h, 0)`,
    { l: ADMIN, h: await gerarHash(SENHA_ADMIN) }
  );
  await query(
    "INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, ADMIN) VALUES (@l, 'orcamento', 1)",
    { l: ADMIN }
  );

  // --- login por senha do portal -------------------------------------------
  const errado = await req("/api/login", {
    metodo: "POST", corpo: { usuario: ADMIN, senha: "nao-e-essa-senha" },
  });
  ok(errado.status === 401, `senha errada é 401 (veio ${errado.status})`);

  const certo = await req("/api/login", {
    metodo: "POST", corpo: { usuario: ADMIN, senha: SENHA_ADMIN },
  });
  ok(certo.ok, "senha certa entra");
  const admin = { cookie: cookieDe(certo) };
  ok((await certo.json()).admin === true, "e a sessão diz que é admin");

  // --- cadastrar alguém: senha sorteada, mostrada uma vez -------------------
  const criado = await (
    await req("/api/usuarios", { ...admin, metodo: "POST", corpo: { login: ALVO, nome: "Alvo de Teste" } })
  ).json();
  ok(typeof criado.senha === "string" && criado.senha.length >= 10, "cadastrar devolve a primeira senha");

  const guardado = await query(
    "SELECT SENHA_HASH, TROCAR_SENHA FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @l", { l: ALVO }
  );
  ok(!guardado[0].SENHA_HASH.includes(criado.senha), "o banco guarda o hash, nunca a senha");
  ok(guardado[0].TROCAR_SENHA === true, "e já nasce com troca obrigatória");

  // --- entra, mas o portal fica trancado até trocar -------------------------
  const primeiro = await req("/api/login", {
    metodo: "POST", corpo: { usuario: ALVO, senha: criado.senha },
  });
  ok(primeiro.ok, "a primeira senha entra");
  const alvo = { cookie: cookieDe(primeiro) };
  ok((await primeiro.json()).trocarSenha === true, "a sessão avisa que a troca está pendente");

  ok((await req("/api/filiais", alvo)).status === 428, "com troca pendente, o resto do portal recusa");
  ok((await req("/api/estado", alvo)).status === 428, "e isso vale para qualquer rota");

  // --- trocar --------------------------------------------------------------
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: "chute-errado-aqui", senhaNova: "Chuva-Azul-2026" } })).status === 401,
    "trocar exige a senha atual certa, mesmo já logado"
  );
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: criado.senha, senhaNova: "senha123456" } })).status === 400,
    "senha nova fraca é recusada"
  );
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: criado.senha, senhaNova: criado.senha } })).status === 400,
    "a senha nova precisa ser diferente da atual"
  );

  const trocou = await req("/api/senha", {
    ...alvo, metodo: "POST", corpo: { senhaAtual: criado.senha, senhaNova: "Chuva-Azul-2026" },
  });
  ok(trocou.ok, "troca válida é aceita");
  ok((await (await req("/api/sessao", alvo)).json())?.trocarSenha === false, "a pendência sai da sessão");
  ok((await req("/api/filiais", alvo)).status !== 428, "e o portal destranca");

  // Aqui, e não depois: a redefinição abaixo apaga as sessões do alvo, e o
  // cookie morto devolveria 401 — que também barra, mas não é o que se quer
  // provar. Com a sessão viva e sem pendência, o 403 é mesmo do `exigirAdmin`.
  ok(
    (await req(`/api/usuarios/${ADMIN}/senha`, { ...alvo, metodo: "POST" })).status === 403,
    "não-admin não redefine a senha de ninguém"
  );

  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: criado.senha } })).status === 401,
    "a senha antiga para de valer"
  );
  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: "Chuva-Azul-2026" } })).ok,
    "a nova vale"
  );

  // --- redefinição pelo administrador --------------------------------------
  const nova = await (await req(`/api/usuarios/${ALVO}/senha`, { ...admin, metodo: "POST" })).json();
  ok(typeof nova.senha === "string", "admin gera nova senha");
  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: "Chuva-Azul-2026" } })).status === 401,
    "a senha que a pessoa tinha escolhido para de valer"
  );
  const reentrou = await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: nova.senha } });
  ok((await reentrou.json()).trocarSenha === true, "e a redefinida volta a exigir troca");

  // Redefinir derruba as sessões abertas: senha trocada por suspeita não pode
  // deixar a sessão de quem entrou de pé até expirar.
  ok((await req("/api/sessao", alvo)).status === 200
     && (await (await req("/api/sessao", alvo)).json()) === null,
     "redefinir derruba a sessão que estava aberta");

  // --- login inexistente ---------------------------------------------------
  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: "__t.nao.existe", senha: "x" } })).status === 401,
    "login inexistente devolve o mesmo 401, sem dizer que não existe"
  );
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
