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
  "dbo.KING_PORTAL_ORC_MIGRATION",
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

const tipos = [
  ["dbo.KING_IDENTIDADE_SESSAO", "SID_HASH", "char", 64, null, null, false],
  ["dbo.KING_PORTAL_ORC_PLANEJADO", "MES", "tinyint", 1, null, null, false],
  ["dbo.KING_PORTAL_ORC_PLANEJADO", "VALOR", "decimal", 9, 18, 6, false],
  ["dbo.KING_PORTAL_ORC_PLANO", "ID_ORCAMENTO", "int", 4, null, null, true],
];

const constraints = [
  "PK_KING_IDENTIDADE_SESSAO",
  "CK_KING_IDENTIDADE_ACESSO_SITUACAO",
  "PK_KING_PORTAL_ORC_VISAO_CONTA",
  "FK_KING_PORTAL_ORC_VISAO_CONTA_VISAO",
  "PK_KING_PORTAL_ORC_PLANEJADO",
  "FK_KING_PORTAL_ORC_PLANEJADO_PLANO",
  "CK_KING_PORTAL_ORC_PLANEJADO_MES",
  "CK_KING_PORTAL_ORC_PLANO_SITUACAO",
  "PK_KING_PORTAL_ORC_MIGRATION",
];

const indices = [
  ["dbo.KING_IDENTIDADE_SESSAO", "IX_KING_IDENTIDADE_SESSAO_EXPIRA"],
  ["dbo.KING_PORTAL_ORC_ACESSO", "IX_KING_PORTAL_ORC_ACESSO_LOGIN"],
  ["dbo.KING_PORTAL_ORC_PLANEJADO", "IX_KING_PORTAL_ORC_PLANEJADO_TELA"],
  ["dbo.KING_PORTAL_ORC_PLANO", "UX_KING_PORTAL_ORC_PLANO_ORCAMENTO"],
];

const ausentes = [];
const tabelasPresentes = new Set();

try {
  for (const tabela of tabelas) {
    const linha = await queryOne(
      "SELECT CASE WHEN OBJECT_ID(@objeto, 'U') IS NULL THEN 0 ELSE 1 END AS presente",
      { objeto: tabela }
    );
    if (linha?.presente) tabelasPresentes.add(tabela);
    else ausentes.push(tabela);
  }

  for (const [tabela, coluna] of colunas) {
    const linha = await queryOne(
      "SELECT CASE WHEN COL_LENGTH(@objeto, @coluna) IS NULL THEN 0 ELSE 1 END AS presente",
      { objeto: tabela, coluna }
    );
    if (!linha?.presente) ausentes.push(`${tabela}.${coluna}`);
  }

  for (const [tabela, coluna, tipo, tamanho, precisao, escala, anulavel] of tipos) {
    const linha = await queryOne(
      `SELECT TYPE_NAME(user_type_id) AS tipo, max_length AS tamanho,
              precision AS precisao, scale AS escala, is_nullable AS anulavel
         FROM sys.columns
        WHERE object_id = OBJECT_ID(@tabela) AND name = @coluna`,
      { tabela, coluna }
    );
    if (
      !linha ||
      linha.tipo !== tipo ||
      Number(linha.tamanho) !== tamanho ||
      (precisao != null && Number(linha.precisao) !== precisao) ||
      (escala != null && Number(linha.escala) !== escala) ||
      Boolean(linha.anulavel) !== anulavel
    ) {
      ausentes.push(`${tabela}.${coluna} (tipo esperado ${tipo})`);
    }
  }

  for (const nome of constraints) {
    const linha = await queryOne(
      "SELECT CASE WHEN OBJECT_ID(@nome) IS NULL THEN 0 ELSE 1 END AS presente",
      { nome: `dbo.${nome}` }
    );
    if (!linha?.presente) ausentes.push(`constraint ${nome}`);
  }

  for (const [tabela, nome] of indices) {
    const linha = await queryOne(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(@tabela) AND name = @nome
       ) THEN 1 ELSE 0 END AS presente`,
      { tabela, nome }
    );
    if (!linha?.presente) ausentes.push(`índice ${nome}`);
  }

  const trigger = await queryOne(
    "SELECT CASE WHEN OBJECT_ID('dbo.TR_KING_PORTAL_ORC_VISAO_CONTA_EXCLUSIVA', 'TR') IS NULL THEN 0 ELSE 1 END AS presente"
  );
  if (!trigger?.presente) ausentes.push("trigger TR_KING_PORTAL_ORC_VISAO_CONTA_EXCLUSIVA");

  if (tabelasPresentes.has("dbo.KING_PORTAL_ORC_MIGRATION")) {
    const migration = await queryOne(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_MIGRATION WHERE VERSAO = 14) THEN 1 ELSE 0 END AS presente"
    );
    if (!migration?.presente) ausentes.push("migration 014");
  }

  if (ausentes.length) {
    console.error("Schema incompatível. Aplique os scripts SQL pendentes antes do deploy:");
    ausentes.forEach((item) => console.error(`  - ${item}`));
    process.exitCode = 1;
  } else {
    console.log("Schema compatível com as migrations 001–014, constraints e índices essenciais.");
  }
} finally {
  await encerrar();
}
