import { query } from "./sqlserver.js";

// ============================================================================
// Consultas ao ERP
//
// PENDENTE: os SELECTs abaixo estão com a forma esperada, mas os nomes de view
// e de coluna ainda não foram confirmados. Enquanto `DB_VIEW_*` não estiver no
// .env, as rotas correspondentes respondem 503 com a mensagem do que falta.
//
// Ao confirmar, ajustar aqui e só aqui — o front consome as rotas, não o banco.
// ============================================================================

// Nome de objeto não pode ir por bind (só valor pode), então é interpolado.
// Vem do .env — que é do operador, não do usuário — e ainda assim é validado,
// para um .env mal preenchido não virar injeção.
const IDENTIFICADOR = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,2}$/;

function objeto(variavel) {
  const nome = process.env[variavel];
  if (!nome) {
    const erro = new Error(
      `${variavel} não está definida no .env — informe a view/tabela de origem.`
    );
    erro.status = 503;
    throw erro;
  }
  if (!IDENTIFICADOR.test(nome)) {
    const erro = new Error(`${variavel} tem formato inválido: ${nome}`);
    erro.status = 500;
    throw erro;
  }
  return nome;
}

// Plano de contas. Substitui `contasDoModulo()` do front.
// Colunas esperadas: código, descrição e um discriminador de natureza
// (receita/despesa) — confirmar os nomes reais.
export async function listarContas() {
  const view = objeto("DB_VIEW_CONTAS");
  return query(`
    SELECT
      CODIGO      AS codigo,
      DESCRICAO   AS descricao,
      NATUREZA    AS natureza
    FROM ${view}
    ORDER BY CODIGO
  `);
}

// Realizado mensal por conta e filial. Substitui `gerarRealizado()` do mock.
export async function listarRealizado({ ano, filialId }) {
  const view = objeto("DB_VIEW_REALIZADO");
  return query(
    `
    SELECT
      CODIGO_CONTA AS conta,
      COD_FILIAL   AS filial,
      MES          AS mes,
      SUM(VALOR)   AS valor
    FROM ${view}
    WHERE ANO = @ano
      AND (@filial IS NULL OR COD_FILIAL = @filial)
    GROUP BY CODIGO_CONTA, COD_FILIAL, MES
    ORDER BY CODIGO_CONTA, MES
  `,
    { ano, filial: filialId ?? null }
  );
}

// Filiais cadastradas no ERP. Substitui FILIAIS_SEED.
export async function listarFiliais() {
  const view = objeto("DB_VIEW_FILIAIS");
  return query(`
    SELECT
      COD_FILIAL AS id,
      NOME       AS nome
    FROM ${view}
    ORDER BY NOME
  `);
}

// Centros de custo do ERP. Substitui CENTROS_SEED.
export async function listarCentrosDeCusto() {
  const view = objeto("DB_VIEW_CENTROS");
  return query(`
    SELECT
      CODIGO    AS codigo,
      DESCRICAO AS nome
    FROM ${view}
    ORDER BY CODIGO
  `);
}
