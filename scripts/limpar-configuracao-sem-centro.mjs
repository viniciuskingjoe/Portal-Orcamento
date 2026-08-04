// Apaga o que ficou preso ao modelo antigo, em que o centro de custo era
// opcional por módulo.
//
//   node --env-file=.env scripts/limpar-configuracao-sem-centro.mjs          (só mostra)
//   node --env-file=.env scripts/limpar-configuracao-sem-centro.mjs --apagar (executa)
//
// Sem centro obrigatório, contas eram configuradas no nível da FILIAL e o
// planejado era gravado com o centro vazio. Agora quem manda são os centros:
// aquelas linhas não pertencem a nenhum, não aparecem em tela nenhuma e não têm
// como ser alcançadas — mas continuam somando no consolidado da filial, o que
// faz o "Total — todos os centros" mostrar um número que ninguém consegue abrir.
//
// Roda em seco por padrão. Nada é apagado sem `--apagar`.

import { encerrar, query, transaction } from "../server/sqlserver.js";

const apagar = process.argv.includes("--apagar");

const SEM_CENTRO = "(CENTRO_CUSTO IS NULL OR CENTRO_CUSTO = '')";

try {
  const [{ contas }] = await query(
    `SELECT COUNT(*) AS contas FROM dbo.KING_PORTAL_ORC_VISAO_CONTA WHERE ${SEM_CENTRO}`
  );
  const [{ celulas }] = await query(
    `SELECT COUNT(*) AS celulas FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE ${SEM_CENTRO}`
  );

  console.log(`
  A apagar
    contas da visão em nível de filial ....... ${String(contas).padStart(6)}
    células de planejado sem centro .......... ${String(celulas).padStart(6)}
`);

  if (!contas && !celulas) {
    console.log("  Nada preso ao modelo antigo. Nenhuma ação.\n");
  } else if (!apagar) {
    // O detalhe por módulo só importa quando há o que apagar.
    console.log("  Por módulo:");
    for (const linha of await query(
      `SELECT MODULO, COUNT(*) AS n FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
        WHERE ${SEM_CENTRO} GROUP BY MODULO ORDER BY MODULO`
    )) {
      console.log(`    ${linha.MODULO.padEnd(24)} ${String(linha.n).padStart(5)} contas`);
    }
    console.log(`
  Isto é uma simulação. Para apagar de verdade:
    node --env-file=.env scripts/limpar-configuracao-sem-centro.mjs --apagar

  Depois: em Visões, marque os centros de cada filial e use "Preencher com o
  padrão" — ele agora despeja nos centros marcados.
`);
  } else {
    // Uma transação só: metade apagado deixaria o consolidado da filial
    // desalinhado com os centros, que é pior que não ter apagado nada.
    await transaction(async ({ query: q }) => {
      await q(`DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA WHERE ${SEM_CENTRO}`);
      await q(`DELETE FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE ${SEM_CENTRO}`);
    });

    console.log(`  Apagado: ${contas} contas e ${celulas} células.

  Em Visões, marque os centros de cada filial e use "Preencher com o padrão".
`);
  }
} finally {
  await encerrar();
}
