import { encerrar, queryOne } from "../server/sqlserver.js";

const tabelas = [
  "dbo.KING_IDENTIDADE_USUARIO",
  "dbo.KING_IDENTIDADE_ACESSO",
  "dbo.KING_IDENTIDADE_SESSAO",
  "dbo.KING_IDENTIDADE_AUDITORIA",
  "dbo.KING_PORTAL_ORC_ACESSO",
  "dbo.KING_PORTAL_ORC_CONFIGURACAO",
  "dbo.KING_PORTAL_ORC_VISAO",
  "dbo.KING_PORTAL_ORC_VISAO_MODULO",
  "dbo.KING_PORTAL_ORC_VISAO_CENTRO",
  "dbo.KING_PORTAL_ORC_VISAO_CONTA",
  "dbo.KING_PORTAL_ORC_VISAO_FORMULA",
  "dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA",
  "dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA",
  "dbo.KING_PORTAL_ORC_PLANO",
  "dbo.KING_PORTAL_ORC_PLANEJADO",
  "dbo.KING_PORTAL_ORC_FUNCIONARIO",
  "dbo.KING_PORTAL_ORC_GRUPO",
  "dbo.KING_PORTAL_ORC_GRUPO_CENTRO",
  "dbo.CTB_ORCAMENTO",
  "dbo.CTB_CONTA_ORCAMENTO",
];

const colunas = [
  ["dbo.KING_PORTAL_ORC_PLANO", "ID_ORCAMENTO"],
  ["dbo.KING_PORTAL_ORC_PLANO", "PUBLICADO_EM"],
  ["dbo.KING_PORTAL_ORC_PLANO", "PUBLICADO_LINHAS"],
  ["dbo.KING_PORTAL_ORC_PLANO", "SITUACAO"],
  ["dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA", "UNIDADE"],
  ["dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA", "SINAL"],
  ["dbo.CTB_CONTA_ORCAMENTO", "U_QTDE_FUNCIONARIO"],
];

const ausentes = [];

try {
  for (const tabela of tabelas) {
    const linha = await queryOne(
      "SELECT CASE WHEN OBJECT_ID(@objeto, 'U') IS NULL THEN 0 ELSE 1 END AS presente",
      { objeto: tabela }
    );
    if (!linha?.presente) ausentes.push(tabela);
  }

  for (const [tabela, coluna] of colunas) {
    const linha = await queryOne(
      "SELECT CASE WHEN COL_LENGTH(@objeto, @coluna) IS NULL THEN 0 ELSE 1 END AS presente",
      { objeto: tabela, coluna }
    );
    if (!linha?.presente) ausentes.push(`${tabela}.${coluna}`);
  }

  if (ausentes.length) {
    console.error("Schema incompatível. Aplique os scripts SQL pendentes antes do deploy:");
    ausentes.forEach((item) => console.error(`  - ${item}`));
    process.exitCode = 1;
  } else {
    console.log("Schema compatível com as migrations 001–013.");
  }
} finally {
  await encerrar();
}
