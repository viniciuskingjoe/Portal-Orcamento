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
  // Um admin com senha do portal já definida, para exercitar a administração.
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
  ok(certo.ok, "senha do portal entra");
  const admin = { cookie: cookieDe(certo) };
  ok((await certo.json()).admin === true, "e a sessão diz que é admin");

  // --- cadastrar alguém não cria senha --------------------------------------
  const criado = await (
    await req("/api/usuarios", { ...admin, metodo: "POST", corpo: { login: ALVO, nome: "Alvo de Teste" } })
  ).json();
  ok(criado.senha === undefined, "cadastrar NÃO devolve senha: não há senha inicial para entregar");

  const nascido = await query(
    "SELECT SENHA_HASH FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @l", { l: ALVO }
  );
  ok(nascido[0].SENHA_HASH === null, "e o cadastro nasce sem senha no portal");

  // Sem senha no portal quem valida é o AD. Não há como fazer bind com um login
  // de teste, então o que se prova aqui é que uma senha qualquer não abre a
  // conta — e que a resposta não denuncia qual das duas portas está valendo.
  const semSenha = await req("/api/login", {
    metodo: "POST", corpo: { usuario: ALVO, senha: "qualquer-coisa-aqui" },
  });
  ok(
    [401, 503].includes(semSenha.status),
    `sem senha no portal a tentativa vai ao AD e é recusada (veio ${semSenha.status})`
  );

  // --- com senha do portal definida ----------------------------------------
  // Equivale a a pessoa ter passado pela tela de primeiro acesso.
  await query(
    "UPDATE dbo.KING_IDENTIDADE_USUARIO SET SENHA_HASH = @h, TROCAR_SENHA = 0 WHERE LOGIN = @l",
    { l: ALVO, h: await gerarHash("Chuva-Azul-2026") }
  );

  const comSenha = await req("/api/login", {
    metodo: "POST", corpo: { usuario: ALVO, senha: "Chuva-Azul-2026" },
  });
  ok(comSenha.ok, "a senha do portal passa a valer");
  const alvo = { cookie: cookieDe(comSenha) };
  const sessaoAlvo = await comSenha.json();
  ok(sessaoAlvo.trocarSenha === false, "e não pede troca");
  ok(sessaoAlvo.primeiroAcesso === false, "nem é mais primeiro acesso");

  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: "outra-senha-99" } })).status === 401,
    "definida a senha do portal, o AD não é mais consultado para esta conta"
  );

  // --- trocar --------------------------------------------------------------
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: "chute-errado-aqui", senhaNova: "Vento-Norte-2026" } })).status === 401,
    "trocar exige a senha atual certa, mesmo já logado"
  );
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: "Chuva-Azul-2026", senhaNova: "senha123456" } })).status === 400,
    "senha nova fraca é recusada"
  );
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: "Chuva-Azul-2026", senhaNova: "Chuva-Azul-2026" } })).status === 400,
    "a senha nova precisa ser diferente da atual"
  );
  ok(
    (await req("/api/senha", { ...alvo, metodo: "POST",
      corpo: { senhaAtual: "Chuva-Azul-2026", senhaNova: "Vento-Norte-2026" } })).ok,
    "troca válida é aceita"
  );
  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: "Chuva-Azul-2026" } })).status === 401,
    "a senha antiga para de valer"
  );

  const comNova = await req("/api/login", {
    metodo: "POST", corpo: { usuario: ALVO, senha: "Vento-Norte-2026" },
  });
  ok(comNova.ok, "a nova vale");
  const alvoNovo = { cookie: cookieDe(comNova) };

  ok(
    (await req(`/api/usuarios/${ADMIN}/senha`, { ...alvoNovo, metodo: "POST" })).status === 403,
    "não-admin não apaga a senha de ninguém"
  );

  // --- admin apaga a senha: a conta volta a entrar pelo AD ------------------
  ok(
    (await req(`/api/usuarios/${ALVO}/senha`, { ...admin, metodo: "POST" })).ok,
    "admin apaga a senha do portal"
  );
  const depois = await query(
    "SELECT SENHA_HASH FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @l", { l: ALVO }
  );
  ok(
    depois[0].SENHA_HASH === null,
    "a senha é APAGADA, não trocada por outra conhecida que alguém teria que repassar"
  );
  ok(
    (await req("/api/login", { metodo: "POST", corpo: { usuario: ALVO, senha: "Vento-Norte-2026" } })).status === 401,
    "a senha que a pessoa tinha escolhido para de valer"
  );
  ok(
    (await (await req("/api/sessao", alvoNovo)).json()) === null,
    "e a sessão que estava aberta cai"
  );

  // --- login inexistente ---------------------------------------------------
  // Não chega ao AD: consultar o diretório para qualquer nome digitado seria um
  // descobridor de contas, e gastaria tentativa de bloqueio de gente que nem
  // usa o portal.
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
