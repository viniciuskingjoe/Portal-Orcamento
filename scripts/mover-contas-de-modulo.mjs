// ============================================================================
// MOVER CONTAS DE UM MÓDULO PARA OUTRO
//
// O CSV do Scoreplan traz um arquivo por módulo, e o de "Despesas operacionais"
// mistura três famílias — inclusive as de pessoal (421.10, 431.01, 441.01), que
// no Scoreplan têm tela própria com quantidade de funcionários.
//
// Mover é mais que trocar o MODULO da conta: a visão precisa conhecer o módulo
// novo e os centros dele, senão as contas mudam de lugar e somem da tela.
//
// O planejado vai junto. Deixar valor para trás faria o total do DRE cair sem
// que ninguém tivesse apagado nada.
//
// Uso:
//   node --env-file=.env scripts/mover-contas-de-modulo.mjs \
//     --de despesas-operacionais --para despesas-pessoal \
//     --prefixos 4.2.1.10,4.3.1.01,4.4.1.01
//   ... --aplicar   para gravar
// ============================================================================

import { query, transaction } from "../server/sqlserver.js";
import { MODULOS } from "../src/dados/modulos.js";

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : null;
}

const filtroDePrefixos = (prefixos, coluna) =>
  prefixos.map((_, i) => `RTRIM(${coluna}) LIKE @p${i} + '%'`).join(" OR ");

const parametrosDePrefixos = (prefixos) =>
  Object.fromEntries(prefixos.map((prefixo, i) => [`p${i}`, prefixo]));

async function principal() {
  const de = argumento("de");
  const para = argumento("para");
  const prefixos = (argumento("prefixos") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const aplicar = process.argv.includes("--aplicar");

  if (!de || !para || !prefixos.length) {
    console.error("Uso: --de <modulo> --para <modulo> --prefixos 4.2.1.10,4.3.1.01 [--aplicar]");
    process.exit(1);
  }

  // Módulo inventado gravaria linhas que nenhuma tela lê — some sem erro.
  for (const modulo of [de, para]) {
    if (!MODULOS.some((item) => item.id === modulo)) {
      console.error(`Módulo desconhecido: ${modulo}`);
      console.error(`Conhecidos: ${MODULOS.map((m) => m.id).join(", ")}`);
      process.exit(1);
    }
  }

  const onde = filtroDePrefixos(prefixos, "CLASSIFICACAO");
  const params = { ...parametrosDePrefixos(prefixos), de, para };

  const contas = await query(
    `SELECT DISTINCT RTRIM(CLASSIFICACAO) AS conta
       FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
      WHERE MODULO = @de AND (${onde}) ORDER BY 1`,
    params
  );
  const [{ linhas }] = await query(
    `SELECT COUNT(*) AS linhas FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
      WHERE MODULO = @de AND (${onde})`,
    params
  );
  const [{ celulas, soma }] = await query(
    `SELECT COUNT(*) AS celulas, CAST(ISNULL(SUM(VALOR), 0) AS DECIMAL(18,2)) AS soma
       FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE MODULO = @de AND (${onde})`,
    params
  );

  // Colisão só aconteceria se o destino já tivesse a mesma combinação. A chave
  // do planejado inclui o módulo, então mover criaria duplicata em vez de erro.
  const [{ colidem }] = await query(
    `SELECT COUNT(*) AS colidem
       FROM dbo.KING_PORTAL_ORC_PLANEJADO AS origem
       JOIN dbo.KING_PORTAL_ORC_PLANEJADO AS destino
         ON destino.PLANO_ID = origem.PLANO_ID
        AND destino.MODULO = @para
        AND destino.COD_FILIAL = origem.COD_FILIAL
        AND destino.CENTRO_CUSTO = origem.CENTRO_CUSTO
        AND destino.CLASSIFICACAO = origem.CLASSIFICACAO
        AND destino.RECEITA = origem.RECEITA
        AND destino.MES = origem.MES
      WHERE origem.MODULO = @de AND (${filtroDePrefixos(prefixos, "origem.CLASSIFICACAO")})`,
    params
  );

  console.log(`\nDe ${de} para ${para}, prefixos ${prefixos.join(", ")}:\n`);
  console.log(`  contas ................ ${contas.length}`);
  console.log(`  linhas da visão ....... ${linhas}`);
  console.log(`  células de planejado .. ${celulas}  (R$ ${soma})`);
  console.log(`\n  ${contas.map((c) => c.conta).join("  ")}\n`);

  if (colidem) {
    console.error(`ABORTADO: ${colidem} células já existem em ${para} — mover criaria duplicata.`);
    process.exit(1);
  }

  if (!aplicar) {
    console.log("Conferência apenas. Para gravar, acrescente --aplicar\n");
    process.exit(0);
  }

  await transaction(async ({ query: q }) => {
    // 1) O módulo destino precisa existir em cada visão que tinha a origem.
    await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_VISAO_MODULO (VISAO_ID, MODULO, USA_CENTRO)
       SELECT DISTINCT vc.VISAO_ID, @para, 1
         FROM dbo.KING_PORTAL_ORC_VISAO_CONTA AS vc
        WHERE vc.MODULO = @de AND (${filtroDePrefixos(prefixos, "vc.CLASSIFICACAO")})
          AND NOT EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO_MODULO AS vm
                           WHERE vm.VISAO_ID = vc.VISAO_ID AND vm.MODULO = @para)`,
      params
    );

    // 2) E precisa dos MESMOS centros, senão a conta muda de módulo e some da
    //    tela: o portal só desenha filial × centro que a visão configurou.
    await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_VISAO_CENTRO (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO)
       SELECT DISTINCT vc.VISAO_ID, @para, vc.COD_FILIAL, vc.CENTRO_CUSTO
         FROM dbo.KING_PORTAL_ORC_VISAO_CONTA AS vc
        WHERE vc.MODULO = @de AND (${filtroDePrefixos(prefixos, "vc.CLASSIFICACAO")})
          AND NOT EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO AS vce
                           WHERE vce.VISAO_ID = vc.VISAO_ID AND vce.MODULO = @para
                             AND vce.COD_FILIAL = vc.COD_FILIAL
                             AND vce.CENTRO_CUSTO = vc.CENTRO_CUSTO)`,
      params
    );

    await q(
      `UPDATE dbo.KING_PORTAL_ORC_VISAO_CONTA SET MODULO = @para
        WHERE MODULO = @de AND (${onde})`,
      params
    );

    await q(
      `UPDATE dbo.KING_PORTAL_ORC_PLANEJADO SET MODULO = @para
        WHERE MODULO = @de AND (${onde})`,
      params
    );

    // 3) Centro que ficou sem conta nenhuma na origem vira linha órfã: aparece
    //    no seletor e não oferece nada.
    await q(
      `DELETE vce FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO AS vce
        WHERE vce.MODULO = @de
          AND NOT EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO_CONTA AS vc
                           WHERE vc.VISAO_ID = vce.VISAO_ID AND vc.MODULO = vce.MODULO
                             AND vc.COD_FILIAL = vce.COD_FILIAL
                             AND vc.CENTRO_CUSTO = vce.CENTRO_CUSTO)`,
      { de, para }
    );
  });

  console.log(`Movidas ${linhas} linhas da visão e ${celulas} células de planejado.\n`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
