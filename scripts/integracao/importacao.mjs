// Teste de integração: roda contra o KINGEJOE de verdade.
//   node --env-file=.env scripts/integracao/importacao.mjs
// Fora de test/ de propósito: `node --test` varre aquela pasta inteira, e o
// `npm test` não pode depender de banco nem de rede.
// Cria e apaga os próprios registros, todos com prefixo `__t`.

process.env.API_PORT = "3415";
const BASE = "http://localhost:3415";
const { query, encerrar } = await import("../../server/sqlserver.js");
const { createHash, randomBytes } = await import("node:crypto");

const ADMIN = "__t.import.admin";
const COMUM = "__t.import.comum";
const VISAO = "__t-imp-visao";
const PLANO = "__t-imp-plano";

async function limpar() {
  await query("DELETE FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @p", { p: PLANO });
  await query("DELETE FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @v", { v: VISAO });
  for (const l of [ADMIN, COMUM]) {
    await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @l", { l });
    await query("DELETE FROM dbo.KING_PORTAL_ORC_ACESSO WHERE LOGIN = @l", { l });
    await query("DELETE FROM dbo.KING_IDENTIDADE_ACESSO WHERE LOGIN = @l", { l });
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

async function criar(login, admin) {
  await query("INSERT INTO dbo.KING_IDENTIDADE_USUARIO (LOGIN, NOME, ORIGEM) VALUES (@l, @l, 'manual')", { l: login });
  await query("INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, ADMIN) VALUES (@l, 'orcamento', @a)", { l: login, a: admin });
  await query(
    "INSERT INTO dbo.KING_PORTAL_ORC_ACESSO (LOGIN, MODULO, COD_FILIAL, CENTRO_CUSTO, PODE_EDITAR) VALUES (@l, NULL, NULL, NULL, 1)",
    { l: login }
  );
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

// O formato que o navegador guardava: visão com centro de custo, um centro
// marcado e vazio, e planejado em reais e em percentual.
const legado = {
  configuracao: { filiaisAtivas: ["000001", "000025"] },
  visoes: [
    {
      id: VISAO,
      nome: "DRE importada",
      visaoContabil: "25",
      modulos: {
        "receita-vendas": {
          usaCentro: false,
          sinais: {},
          filiais: { "000001": { contas: ["3.1.1.01.001"], centros: {} } },
        },
        "despesas-operacionais": {
          usaCentro: true,
          sinais: { "4.4.1.01.001": "receita" },
          filiais: {
            "000001": {
              contas: ["4.4.1.01.001"],
              centros: { "020": ["4.4.1.01.001"], "002": [] },
            },
          },
        },
      },
    },
  ],
  planos: [
    {
      id: PLANO,
      nome: "Plano importado",
      ano: 2026,
      visaoId: VISAO,
      planejado: {
        "despesas-operacionais|000001|020|4.4.1.01.001|1": 4321.99,
        "deducoes-vendas|000001||3.1.2.01.001|1|3.1.1.01.001": 38.959531,
      },
    },
  ],
};

try {
  const admin = await criar(ADMIN, 1);
  const comum = await criar(COMUM, 0);

  ok(
    (await req("/api/estado/importar", { ...comum, metodo: "POST", corpo: legado })).status === 403,
    "só admin importa"
  );

  // A importação do legado só roda uma vez, com o portal ainda vazio. Depois que
  // alguém importou de verdade — que é o caso de qualquer banco em uso — esse
  // caminho não existe mais, e esvaziar o banco para testá-lo apagaria o
  // orçamento da empresa. Então: com dados, o que se verifica é a TRAVA.
  const vazio = (await (await req("/api/estado/vazio", admin)).json()).vazio === true;

  if (!vazio) {
    ok(
      (await req("/api/estado/importar", { ...admin, metodo: "POST", corpo: legado })).status === 409,
      "banco em uso: a importação é recusada em vez de sobrescrever"
    );
    console.log("  --  o resto exige banco vazio e foi pulado (o portal já tem dados)");
    console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
    await limpar();
    await encerrar();
    process.exit(falhas.length ? 1 : 0);
  }

  const resumo = await (await req("/api/estado/importar", { ...admin, metodo: "POST", corpo: legado })).json();
  ok(resumo.visoes === 1 && resumo.planos === 1 && resumo.celulas === 2, "importação relata o que trouxe");

  const estado = await (await req("/api/estado", admin)).json();
  const v = estado.visoes.find((x) => x.id === VISAO);
  const plano = estado.planos.find((p) => p.id === PLANO);

  ok(estado.configuracao.filiaisAtivas.join() === "000001,000025", "filiais ativas vieram junto");
  ok(v.nome === "DRE importada" && v.visaoContabil === "25", "visão veio com a visão contábil");
  ok(v.modulos["receita-vendas"].filiais["000001"].contas.length === 1, "módulo sem centro veio");
  ok(v.modulos["despesas-operacionais"].usaCentro === true, "usaCentro veio");
  ok(
    Object.keys(v.modulos["despesas-operacionais"].filiais["000001"].centros).sort().join() === "002,020",
    "os dois centros vieram, inclusive o vazio"
  );
  ok(
    v.modulos["despesas-operacionais"].filiais["000001"].centros["002"].length === 0,
    "centro marcado e vazio continua vazio"
  );
  ok(v.modulos["despesas-operacionais"].sinais["4.4.1.01.001"] === "receita", "sinal manual veio");
  ok(plano.planejado["despesas-operacionais|000001|020|4.4.1.01.001|1"] === 4321.99, "valor em reais veio");
  ok(
    plano.planejado["deducoes-vendas|000001||3.1.2.01.001|1|3.1.1.01.001"] === 38.959531,
    "taxa percentual veio com as seis casas"
  );

  ok(
    (await req("/api/estado/importar", { ...admin, metodo: "POST", corpo: legado })).status === 409,
    "importar de novo é recusado — não sobrescreve trabalho de outra pessoa"
  );

  // Trocar a visão contábil invalida o que estava escolhido.
  await req("/api/visoes/" + VISAO, {
    ...admin, metodo: "PUT", corpo: { nome: "DRE importada", visaoContabil: "07" },
  });
  const depois = await (await req("/api/estado", admin)).json();
  ok(
    Object.keys(depois.visoes.find((x) => x.id === VISAO).modulos).length === 0,
    "trocar a visão contábil limpa os módulos no banco, não só na tela"
  );
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
