// Teste de integração: roda contra o KINGEJOE de verdade.
//   node --env-file=.env scripts/integracao/estado.mjs
// Fora de test/ de propósito: `node --test` varre aquela pasta inteira, e o
// `npm test` não pode depender de banco nem de rede.
// Cria e apaga os próprios registros, todos com prefixo `__t`.

process.env.API_PORT = "3414";
const BASE = "http://localhost:3414";
const { query, encerrar } = await import("../../server/sqlserver.js");
const { gerarHash } = await import("../../server/senha.js");
const { createHash, randomBytes } = await import("node:crypto");

const ADMIN = "__t.admin";
const LIMITADO = "__t.limitado";
const LEITOR = "__t.leitor";
const VISAO = "__t-visao";
const PLANO = "__t-plano";

async function limpar() {
  await query("DELETE FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @p", { p: PLANO });
  await query("DELETE FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @v", { v: VISAO });
  for (const l of [ADMIN, LIMITADO, LEITOR]) {
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

async function criar(login, admin, acessos) {
  // Com SENHA_HASH: sem ela o cadastro fica em "primeiro acesso" e toda rota
  // responde 428 (defina a senha do portal), que não é o que estes testes exercitam.
  await query("INSERT INTO dbo.KING_IDENTIDADE_USUARIO (LOGIN, NOME, ORIGEM, SENHA_HASH) VALUES (@l, @l, 'manual', @h)", { l: login, h: await gerarHash("senha-de-teste-99") });
  await query("INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, ADMIN) VALUES (@l, 'orcamento', @a)", { l: login, a: admin });
  for (const a of acessos) {
    await query(
      "INSERT INTO dbo.KING_PORTAL_ORC_ACESSO (LOGIN, MODULO, COD_FILIAL, CENTRO_CUSTO, PODE_EDITAR) VALUES (@l, @m, @f, @c, @e)",
      { l: login, m: a.modulo, f: a.filial, c: a.centro, e: a.editar }
    );
  }
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

const estadoAtual = async (sessao) => (await req("/api/estado", sessao)).json();

try {
  const admin = await criar(ADMIN, 1, []);
  const limitado = await criar(LIMITADO, 0, [{ modulo: null, filial: "000001", centro: "020", editar: 1 }]);
  const leitor = await criar(LEITOR, 0, [{ modulo: null, filial: null, centro: null, editar: 0 }]);

  // --- visão e plano ------------------------------------------------------
  ok(
    (await req("/api/visoes/" + VISAO, { ...admin, metodo: "PUT", corpo: { nome: "Teste", visaoContabil: "25" } })).ok,
    "admin cria visão"
  );
  ok(
    (await req("/api/visoes/" + VISAO, { ...leitor, metodo: "PUT", corpo: { nome: "X" } })).status === 403,
    "não-admin não cria visão"
  );

  const modDesp = "/api/visoes/" + VISAO + "/modulos/despesas-operacionais";
  // Todo módulo é orçado por centro: marcar o centro é o que registra o módulo
  // na visão — não existe mais um `usaCentro` para ligar antes.
  await req(modDesp, { ...admin, metodo: "PUT", corpo: { filial: "000001", centro: "020", usoDoCentro: true } });
  await req(modDesp, { ...admin, metodo: "PUT", corpo: { filial: "000001", centro: "020", contas: ["4.4.1.01.001", "4.4.1.01.002"] } });
  await req("/api/visoes/" + VISAO + "/modulos/receita-vendas", {
    ...admin, metodo: "PUT", corpo: { filial: "000001", centro: "020", usoDoCentro: true },
  });
  await req("/api/visoes/" + VISAO + "/modulos/receita-vendas", {
    ...admin, metodo: "PUT", corpo: { filial: "000001", centro: "020", contas: ["3.1.1.01.001"] },
  });
  await req("/api/planos/" + PLANO, { ...admin, metodo: "PUT", corpo: { nome: "Plano teste", ano: 2026, visaoId: VISAO } });

  // --- leitura reconstrói a forma que o front espera -----------------------
  const estado = await estadoAtual(admin);
  const v = estado.visoes.find((x) => x.id === VISAO);
  const mod = v && v.modulos["despesas-operacionais"];
  ok(mod && mod.filiais["000001"].centros["020"].length === 2, "contas do centro voltam");
  ok(
    mod && mod.filiais["000001"].contas.join() === "4.4.1.01.001,4.4.1.01.002",
    "com centro, a lista da filial é o consolidado derivado"
  );
  // A lista da filial é SEMPRE derivada dos centros, em qualquer módulo.
  ok(
    v.modulos["receita-vendas"].filiais["000001"].contas.join() === "3.1.1.01.001",
    "a lista da filial é o consolidado dos centros, também na receita"
  );

  await req(modDesp, { ...admin, metodo: "PUT", corpo: { filial: "000001", centro: "002", usoDoCentro: true } });
  const centros = (await estadoAtual(admin)).visoes.find((x) => x.id === VISAO)
    .modulos["despesas-operacionais"].filiais["000001"].centros;
  ok(
    Object.keys(centros).sort().join() === "002,020" && centros["002"].length === 0,
    "centro em uso e vazio volta do banco"
  );

  // --- planejado ----------------------------------------------------------
  const celula = (valor) => ({
    celulas: [{ modulo: "despesas-operacionais", filial: "000001", centro: "020", conta: "4.4.1.01.001", receita: null, mes: 1, valor }],
  });
  const chave = "despesas-operacionais|000001|020|4.4.1.01.001|1";
  const planejadoDe = async (sessao) => (await estadoAtual(sessao)).planos.find((p) => p.id === PLANO).planejado;

  ok((await req("/api/planos/" + PLANO + "/planejado", { ...admin, metodo: "PUT", corpo: celula(1234.56) })).ok, "admin grava planejado");
  ok((await planejadoDe(admin))[chave] === 1234.56, "o valor volta na chave que o front usa");

  await req("/api/planos/" + PLANO + "/planejado", {
    ...admin, metodo: "PUT",
    corpo: { celulas: [{ modulo: "deducoes-vendas", filial: "000001", centro: "", conta: "3.1.2.01.001", receita: "3.1.1.01.001", mes: 1, valor: 38.959531 }] },
  });
  ok(
    (await planejadoDe(admin))["deducoes-vendas|000001||3.1.2.01.001|1|3.1.1.01.001"] === 38.959531,
    "taxa percentual não perde casas no banco"
  );

  await req("/api/planos/" + PLANO + "/planejado", { ...admin, metodo: "PUT", corpo: celula(0) });
  ok((await planejadoDe(admin))[chave] === undefined, "valor zero apaga a linha");

  // --- permissão no gravar -------------------------------------------------
  ok((await req("/api/planos/" + PLANO + "/planejado", { ...limitado, metodo: "PUT", corpo: celula(10) })).ok, "quem tem o centro 020 grava no 020");

  const trocando = (campo, valor) => ({ celulas: [{ ...celula(10).celulas[0], [campo]: valor }] });
  ok(
    (await req("/api/planos/" + PLANO + "/planejado", { ...limitado, metodo: "PUT", corpo: trocando("centro", "002") })).status === 403,
    "o mesmo usuário é barrado no centro 002 — mandando direto na API"
  );
  ok(
    (await req("/api/planos/" + PLANO + "/planejado", { ...limitado, metodo: "PUT", corpo: trocando("filial", "000025") })).status === 403,
    "e barrado em outra filial"
  );
  ok(
    (await req("/api/planos/" + PLANO + "/planejado", { ...leitor, metodo: "PUT", corpo: celula(10) })).status === 403,
    "quem só vê não grava"
  );

  const lote = { celulas: [celula(99).celulas[0], { ...celula(99).celulas[0], centro: "002", mes: 2 }] };
  ok(
    (await req("/api/planos/" + PLANO + "/planejado", { ...limitado, metodo: "PUT", corpo: lote })).status === 403,
    "lote com célula proibida é recusado inteiro"
  );
  ok((await planejadoDe(admin))[chave] === 10, "e nada do lote recusado foi gravado");

  // --- quem alterou --------------------------------------------------------
  const quem = await query("SELECT DISTINCT ALTERADO_POR FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE PLANO_ID = @p", { p: PLANO });
  ok(quem.some((r) => r.ALTERADO_POR === LIMITADO), "a linha guarda quem alterou");
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
