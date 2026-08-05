// ============================================================================
// TIRAR DE UM MÓDULO AS CONTAS QUE NÃO SÃO DELE
//
// Marcar um nó da árvore arrasta a subárvore inteira, e é fácil um módulo
// terminar com uma família de contas que não é a dele. Quando isso acontece o
// erro não aparece como erro: o sinal da conta vem do GRUPO CONTÁBIL dela, não
// do tipo do módulo, então uma conta de despesa dentro de "Receita de vendas"
// entra SUBTRAINDO — o total fica menor e continua parecendo um total.
//
// Foi o que aconteceu na visão 25: 26 contas 4.5 (resultado financeiro) dentro
// de receita-vendas tiravam R$ 200.794,88 de janeiro/2026.
//
// A trava: conta com planejado gravado NÃO é removida. Tirar da visão uma
// combinação que tem valor lançado esconderia o valor sem apagá-lo, que é pior
// do que a configuração errada.
//
// Uso:
//   node --env-file=.env scripts/limpar-contas-do-modulo.mjs --modulo receita-vendas --manter 3.
//   ... --aplicar   para gravar
// ============================================================================

import { query, transaction } from "../server/sqlserver.js";

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : null;
}

async function principal() {
  const modulo = argumento("modulo");
  const manter = argumento("manter");
  const aplicar = process.argv.includes("--aplicar");

  if (!modulo || !manter) {
    console.error("Uso: --modulo <id> --manter <prefixo> [--aplicar]");
    process.exit(1);
  }

  const alvo = await query(
    `SELECT VISAO_ID, COD_FILIAL, CENTRO_CUSTO, RTRIM(CLASSIFICACAO) AS CLASSIFICACAO
       FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
      WHERE MODULO = @modulo AND RTRIM(CLASSIFICACAO) NOT LIKE @manter + '%'`,
    { modulo, manter }
  );

  if (!alvo.length) {
    console.log(`\nNada a remover: todo o módulo ${modulo} já começa em "${manter}".\n`);
    process.exit(0);
  }

  const comPlanejado = await query(
    `SELECT DISTINCT RTRIM(CLASSIFICACAO) AS CLASSIFICACAO
       FROM dbo.KING_PORTAL_ORC_PLANEJADO
      WHERE MODULO = @modulo AND RTRIM(CLASSIFICACAO) NOT LIKE @manter + '%'`,
    { modulo, manter }
  );
  const travadas = new Set(comPlanejado.map((linha) => linha.CLASSIFICACAO));

  const contas = [...new Set(alvo.map((linha) => linha.CLASSIFICACAO))].sort();
  const remover = alvo.filter((linha) => !travadas.has(linha.CLASSIFICACAO));

  console.log(`\nMódulo ${modulo} — contas que não começam em "${manter}":`);
  console.log(`  contas distintas ....... ${contas.length}`);
  console.log(`  linhas de configuração . ${alvo.length}`);
  console.log(`  a remover .............. ${remover.length}`);
  if (travadas.size) {
    console.log(
      `  PRESERVADAS (têm planejado): ${[...travadas].sort().join(", ")}`
    );
  }
  console.log(`\n  ${contas.join("  ")}\n`);

  if (!aplicar) {
    console.log("Conferência apenas. Para gravar, acrescente --aplicar\n");
    process.exit(0);
  }

  await transaction(async ({ query: q }) => {
    for (const linha of remover) {
      await q(
        `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
          WHERE VISAO_ID = @visao AND MODULO = @modulo AND COD_FILIAL = @filial
            AND CENTRO_CUSTO = @centro AND RTRIM(CLASSIFICACAO) = @conta`,
        {
          visao: linha.VISAO_ID,
          modulo,
          filial: linha.COD_FILIAL,
          centro: linha.CENTRO_CUSTO,
          conta: linha.CLASSIFICACAO,
        }
      );
    }
  });

  console.log(`Removidas ${remover.length} linhas de ${modulo}.\n`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
