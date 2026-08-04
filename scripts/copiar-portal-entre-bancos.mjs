// Copia o que é DO PORTAL de um banco para outro, no mesmo servidor.
//
//   node --env-file=.env scripts/copiar-portal-entre-bancos.mjs KINGEJOE HOMOLOGACAO_RT_LINX
//   node --env-file=.env scripts/copiar-portal-entre-bancos.mjs KINGEJOE HOMOLOGACAO_RT_LINX --copiar
//
// Serve para levar usuários, permissões, visões e planos para um banco de
// homologação e testar lá sem tocar em produção.
//
// NÃO copia nada do ERP: aquilo já existe nos dois lados e é do Linx.
// NÃO copia sessões: sessão é de um navegador, não de um banco — quem for testar
// entra de novo.
//
// O destino precisa ter as tabelas criadas antes (sql/001, 002 e 003).
// Roda em seco por padrão; só escreve com `--copiar`.

import { encerrar, query, transaction } from "../server/sqlserver.js";

const [origem, destino] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const copiar = process.argv.includes("--copiar");

// Nome de banco entra em SQL por concatenação — não dá para parametrizar
// identificador. Daí a exigência de ser um nome simples, sem espaço nem colchete.
const NOME_VALIDO = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;

if (!origem || !destino) {
  console.error("uso: node --env-file=.env scripts/copiar-portal-entre-bancos.mjs <origem> <destino> [--copiar]");
  process.exit(1);
}
for (const nome of [origem, destino]) {
  if (!NOME_VALIDO.test(nome)) {
    console.error(`Nome de banco inválido: ${nome}`);
    process.exit(1);
  }
}
if (origem === destino) {
  console.error("Origem e destino são o mesmo banco.");
  process.exit(1);
}

// A ordem importa: pai antes de filho, senão a chave estrangeira recusa.
const TABELAS = [
  "KING_IDENTIDADE_APP",
  "KING_IDENTIDADE_USUARIO",
  "KING_IDENTIDADE_ACESSO",
  "KING_PORTAL_ORC_ACESSO",
  "KING_PORTAL_ORC_CONFIGURACAO",
  "KING_PORTAL_ORC_VISAO",
  "KING_PORTAL_ORC_VISAO_MODULO",
  "KING_PORTAL_ORC_VISAO_CENTRO",
  "KING_PORTAL_ORC_VISAO_CONTA",
  "KING_PORTAL_ORC_VISAO_SINAL",
  "KING_PORTAL_ORC_PLANO",
  "KING_PORTAL_ORC_PLANEJADO",
];

const colunasDe = async (banco, tabela) => {
  const linhas = await query(
    `SELECT c.name FROM ${banco}.sys.columns c
      WHERE c.object_id = OBJECT_ID('${banco}.dbo.${tabela}') ORDER BY c.column_id`
  );
  return linhas.map((l) => l.name);
};

try {
  console.log(`\n  ${origem}  →  ${destino}\n`);

  const plano = [];
  let faltando = 0;

  for (const tabela of TABELAS) {
    const [{ existeOrigem }] = await query(
      `SELECT OBJECT_ID('${origem}.dbo.${tabela}') AS existeOrigem`
    );
    const [{ existeDestino }] = await query(
      `SELECT OBJECT_ID('${destino}.dbo.${tabela}') AS existeDestino`
    );

    if (!existeDestino) {
      console.log(`   FALTA no destino   ${tabela}`);
      faltando += 1;
      continue;
    }
    if (!existeOrigem) {
      console.log(`   sem origem         ${tabela}`);
      continue;
    }

    const [{ n }] = await query(`SELECT COUNT(*) AS n FROM ${origem}.dbo.${tabela}`);
    const [{ ja }] = await query(`SELECT COUNT(*) AS ja FROM ${destino}.dbo.${tabela}`);
    console.log(
      `   ${tabela.padEnd(32)} ${String(n).padStart(7)} a copiar` +
        (ja ? `   (destino já tem ${ja} — serão apagadas)` : "")
    );
    plano.push({ tabela, n });
  }

  if (faltando) {
    console.error(`
  ${faltando} tabela(s) não existem em ${destino}.
  Rode antes, naquele banco: sql/001-identidade.sql, 002 e 003.
`);
    process.exit(1);
  }

  if (!copiar) {
    console.log(`
  Simulação. Para copiar de verdade, acrescente --copiar

  Depois de copiar, em ${destino}:
    - as senhas vão junto; quem não tinha entra pela senha da rede
    - troque SQLSERVER_DATABASE no .env para ${destino}
`);
  } else {
    // Uma transação só: metade copiado deixaria visão sem contas ou plano sem
    // visão, que é pior que não ter copiado nada.
    await transaction(async ({ query: q }) => {
      // Apaga na ordem inversa — filho antes de pai.
      for (const { tabela } of [...plano].reverse()) {
        await q(`DELETE FROM ${destino}.dbo.${tabela}`);
      }
      for (const { tabela } of plano) {
        const colunas = (await colunasDe(destino, tabela)).join(", ");
        await q(
          `INSERT INTO ${destino}.dbo.${tabela} (${colunas})
           SELECT ${colunas} FROM ${origem}.dbo.${tabela}`
        );
      }
    });

    console.log(`
  Copiado. Agora troque no .env:
      SQLSERVER_DATABASE=${destino}

  E confira em ${destino}: as filiais e os centros vêm do ERP de lá, então a
  configuração copiada só vale se os códigos forem os mesmos.
`);
  }
} finally {
  await encerrar();
}
