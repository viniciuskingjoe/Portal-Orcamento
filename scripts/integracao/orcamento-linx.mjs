// Teste de integração: roda contra o banco de verdade e ESCREVE NO ERP.
//   node --env-file=.env scripts/integracao/orcamento-linx.mjs
//
// Cria o próprio orçamento em CTB_ORCAMENTO, publica nele e apaga tudo no fim.
// Nunca toca em orçamento que não seja o dele.
//
// Recusa rodar em produção: escrever no orçamento do Linx é para ser exercitado
// em homologação, e um `.env` esquecido apontando para KINGEJOE não pode virar
// linha na contabilidade da empresa.

const { query, encerrar } = await import("../../server/sqlserver.js");

const [{ banco }] = await query("SELECT DB_NAME() AS banco");
if (/^KINGEJOE$/i.test(banco)) {
  console.error(`
  Recusando rodar em ${banco}.

  Este roteiro escreve em CTB_ORCAMENTO e CTB_CONTA_ORCAMENTO. Aponte o .env
  para o banco de homologação antes.
`);
  await encerrar();
  process.exit(1);
}

const { publicar } = await import("../../server/orcamentoLinx.js");
const { gravarPlanejado, salvarModulo } = await import("../../server/repositorio.js");

const PLANO = "__t-linx-plano";
const VISAO = "__t-linx-visao";
const LOGIN = "__t.linx";
// O exercício precisa existir em CTB_EXERCICIO (chave estrangeira de
// CTB_ORCAMENTO). Usa o mais recente cadastrado em vez de um ano inventado.
const [{ ID_EXERCICIO: ANO }] = await query(
  "SELECT TOP 1 ID_EXERCICIO FROM dbo.CTB_EXERCICIO WHERE ID_VERSAO_CONTABIL = 1 ORDER BY ID_EXERCICIO DESC"
);

const falhas = [];
const ok = (cond, msg) => {
  if (!cond) falhas.push(msg);
  else console.log("  ok  " + msg);
};

async function limpar() {
  const orcamentos = await query(
    "SELECT ID_ORCAMENTO FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @p",
    { p: PLANO }
  );
  for (const { ID_ORCAMENTO } of orcamentos) {
    if (!ID_ORCAMENTO) continue;
    await query("DELETE FROM dbo.CTB_CONTA_ORCAMENTO WHERE ID_ORCAMENTO = @id", { id: ID_ORCAMENTO });
    await query("DELETE FROM dbo.CTB_ORCAMENTO WHERE ID_ORCAMENTO = @id", { id: ID_ORCAMENTO });
  }
  await query("DELETE FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @p", { p: PLANO });
  await query("DELETE FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @v", { v: VISAO });
  await query("DELETE FROM dbo.KING_IDENTIDADE_AUDITORIA WHERE LOGIN = @l", { l: LOGIN });
}

await limpar();

try {
  // Uma filial e um centro que existam no ERP — as chaves estrangeiras exigem.
  const [{ COD_FILIAL: FILIAL }] = await query("SELECT TOP 1 COD_FILIAL FROM dbo.FILIAIS ORDER BY COD_FILIAL");
  const [{ CENTRO_CUSTO: CENTRO }] = await query(
    "SELECT TOP 1 CENTRO_CUSTO FROM dbo.CTB_CENTRO_CUSTO ORDER BY CENTRO_CUSTO"
  );
  const CONTA = "3.1.1.01.001";
  console.log(`  banco ${banco} · filial ${FILIAL} · centro ${CENTRO}\n`);

  await query(
    "INSERT INTO dbo.KING_PORTAL_ORC_VISAO (ID, NOME, VISAO_CONTABIL) VALUES (@v, 'Teste Linx', '25')",
    { v: VISAO }
  );
  await query(
    "INSERT INTO dbo.KING_PORTAL_ORC_PLANO (ID, NOME, ANO, VISAO_ID) VALUES (@p, 'Teste Linx', @a, @v)",
    { p: PLANO, a: ANO, v: VISAO }
  );

  await salvarModulo(
    VISAO,
    "receita-vendas",
    { filial: FILIAL, centro: CENTRO, usoDoCentro: true, contas: [CONTA] },
    LOGIN
  );
  await gravarPlanejado(
    PLANO,
    [
      { modulo: "receita-vendas", filial: FILIAL, centro: CENTRO, conta: CONTA, receita: "", mes: 1, valor: 1000.5 },
      { modulo: "receita-vendas", filial: FILIAL, centro: CENTRO, conta: CONTA, receita: "", mes: 7, valor: 2000 },
    ],
    LOGIN
  );

  // --- primeira publicação -------------------------------------------------
  const primeira = await publicar(PLANO, LOGIN);
  ok(primeira.linhas === 2, `publicou 2 linhas (veio ${primeira.linhas})`);
  ok(Number.isInteger(primeira.idOrcamento), "criou o orçamento no ERP");

  const [orc] = await query(
    "SELECT DESC_ORCAMENTO, ID_EXERCICIO, COD_STATUS_ORCAMENTO FROM dbo.CTB_ORCAMENTO WHERE ID_ORCAMENTO = @id",
    { id: primeira.idOrcamento }
  );
  ok(orc.COD_STATUS_ORCAMENTO === 1, "o orçamento nasce EM ELABORAÇÃO — é o que desarma o gatilho");
  ok(orc.ID_EXERCICIO === ANO, "e no exercício do plano");

  const linhas = await query(
    `SELECT ID_PERIODO, DATA_LANCAMENTO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, VALOR, USUARIO
       FROM dbo.CTB_CONTA_ORCAMENTO WHERE ID_ORCAMENTO = @id ORDER BY ID_PERIODO`,
    { id: primeira.idOrcamento }
  );
  ok(linhas.length === 2, "as duas linhas estão na tabela do Linx");
  ok(Number(linhas[0].VALOR) === 1000.5, `valor com centavos preservado (${linhas[0].VALOR})`);
  ok(linhas[0].ID_PERIODO === 1 && linhas[1].ID_PERIODO === 7, "período é o mês");
  ok(
    new Date(linhas[0].DATA_LANCAMENTO).getUTCDate() === 1,
    "data de lançamento no primeiro dia do mês"
  );
  ok(linhas[0].CLASSIFICACAO.trim() === CONTA, "classificação é a conta do portal");
  ok(linhas[0].USUARIO.trim() === LOGIN, "guarda quem publicou");

  // --- republicar substitui, não duplica ------------------------------------
  await gravarPlanejado(
    PLANO,
    [{ modulo: "receita-vendas", filial: FILIAL, centro: CENTRO, conta: CONTA, receita: "", mes: 1, valor: 4321 }],
    LOGIN
  );
  const segunda = await publicar(PLANO, LOGIN);
  ok(segunda.idOrcamento === primeira.idOrcamento, "republicar reusa o mesmo orçamento");

  const depois = await query(
    "SELECT ID_PERIODO, VALOR FROM dbo.CTB_CONTA_ORCAMENTO WHERE ID_ORCAMENTO = @id ORDER BY ID_PERIODO",
    { id: primeira.idOrcamento }
  );
  ok(depois.length === 2, `continuam 2 linhas, não 4 (vieram ${depois.length})`);
  ok(Number(depois[0].VALOR) === 4321, "o valor novo substituiu o antigo");

  // --- o guarda-corpo do status --------------------------------------------
  // Com o orçamento ATIVO o gatilho passaria a somar em CTB_SALDO_ORCAMENTO sem
  // forma de desfazer. A publicação tem que recusar.
  await query("UPDATE dbo.CTB_ORCAMENTO SET COD_STATUS_ORCAMENTO = 2 WHERE ID_ORCAMENTO = @id", {
    id: primeira.idOrcamento,
  });

  let recusou = false;
  try {
    await publicar(PLANO, LOGIN);
  } catch (erro) {
    recusou = erro.status === 409 && /ATIVO/.test(erro.message);
  }
  ok(recusou, "publicar em orçamento ATIVO é recusado com 409");

  const intactas = await query(
    "SELECT COUNT(*) AS n FROM dbo.CTB_CONTA_ORCAMENTO WHERE ID_ORCAMENTO = @id",
    { id: primeira.idOrcamento }
  );
  ok(intactas[0].n === 2, "e a recusa não apagou o que já estava publicado");

  await query("UPDATE dbo.CTB_ORCAMENTO SET COD_STATUS_ORCAMENTO = 1 WHERE ID_ORCAMENTO = @id", {
    id: primeira.idOrcamento,
  });

  // --- não encosta em orçamento alheio -------------------------------------
  const [{ n: outros }] = await query(
    "SELECT COUNT(*) AS n FROM dbo.CTB_CONTA_ORCAMENTO WHERE ID_ORCAMENTO <> @id",
    { id: primeira.idOrcamento }
  );
  ok(outros > 300000, `os ${outros} registros dos outros orçamentos seguem intactos`);
} finally {
  await limpar();
  await encerrar();
}

console.log(falhas.length ? "\nFALHAS:\n  " + falhas.join("\n  ") : "\ntudo ok");
process.exit(falhas.length ? 1 : 0);
