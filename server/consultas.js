import { query } from "./sqlserver.js";

// ============================================================================
// Consultas ao ERP (Linx) — somente SELECT, nunca alterar tabela do ERP.
//
// Objetos usados, confirmados no banco KINGEJOE:
//   dbo.CTB_VISAO          visão contábil: classificação, descrição, hierarquia
//   dbo.FILIAIS            filiais
//   dbo.CTB_CENTRO_CUSTO   centros de custo
//   dbo.CTB_LANCAMENTO(_ITEM)  lançamentos contábeis (realizado)
//
// Os nomes vêm do .env para não ficarem cravados no código.
//
// Colunas char/varchar do Linx vêm preenchidas com espaço à direita, por isso
// todo texto passa por RTRIM antes de sair daqui.
// ============================================================================

// Nome de objeto não pode ir por bind (só valor pode), então é interpolado.
// Vem do .env — que é do operador, não do usuário — e ainda assim é validado,
// para um .env mal preenchido não virar injeção.
const IDENTIFICADOR = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,2}$/;

function objeto(variavel, padrao = null) {
  const nome = process.env[variavel]?.trim() || padrao;
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

// Qual visão contábil do ERP fornece as contas do portal. Na KINGEJOE é a "03",
// a única com INDICA_CTRL_ORCAMENTO — as demais não são orçamentárias.
function visaoContabil() {
  const valor = process.env.DB_VISAO_CONTABIL?.trim();
  if (!valor) {
    const erro = new Error("DB_VISAO_CONTABIL não está definida no .env.");
    erro.status = 503;
    throw erro;
  }
  return valor;
}

// Plano de contas orçamentário. Substitui `contasDoModulo()` do front.
//
// `totalizaEm` é o pai na hierarquia: permite montar a árvore
// (Total -> 3 -> 3.1 -> 3.1.1 -> 3.1.1.1 -> 3.1.1.1.02 COLEÇÃO).
export async function listarContas() {
  const tabela = objeto("DB_VIEW_CONTAS", "dbo.CTB_VISAO");
  return query(
    `
    SELECT
      RTRIM(CLASSIFICACAO)               AS codigo,
      RTRIM(DESCR_CONTA)                 AS descricao,
      NULLIF(RTRIM(CLASSIFICACAO_TOTALIZA_EM), '') AS totalizaEm,
      CLASSIFICACAO_ANALITICA            AS sintetica
    FROM ${tabela}
    WHERE RTRIM(VISAO_CONTABIL) = @visao
      AND INDICA_CTRL_ORCAMENTO = 1
    ORDER BY CLASSIFICACAO
  `,
    { visao: visaoContabil() }
  );
}

// Filiais do ERP. Substitui FILIAIS_SEED.
export async function listarFiliais() {
  const tabela = objeto("DB_VIEW_FILIAIS", "dbo.FILIAIS");
  return query(`
    SELECT
      RTRIM(COD_FILIAL)  AS id,
      RTRIM(FILIAL)      AS nome,
      EMPRESA            AS empresa,
      RTRIM(TIPO_FILIAL) AS tipo
    FROM ${tabela}
    WHERE RTRIM(ISNULL(FILIAL, '')) <> ''
    ORDER BY COD_FILIAL
  `);
}

// Centros de custo do ERP. Substitui CENTROS_SEED.
export async function listarCentrosDeCusto() {
  const tabela = objeto("DB_VIEW_CENTROS", "dbo.CTB_CENTRO_CUSTO");
  return query(`
    SELECT
      RTRIM(CENTRO_CUSTO)      AS id,
      RTRIM(DESC_CENTRO_CUSTO) AS nome,
      INATIVA                  AS inativa
    FROM ${tabela}
    WHERE ISNULL(INATIVA, 0) = 0
    ORDER BY CENTRO_CUSTO
  `);
}

// Realizado mensal por conta contábil e filial. Substitui `gerarRealizado()`.
//
// PENDENTE: os itens de lançamento gravam CONTA_CONTABIL, não a classificação
// da visão. Falta confirmar em que tabela vive o de/para conta -> classificação
// (candidata: dbo.CTB_CONTA_PLANO) para agregar por módulo do portal. Até lá
// esta rota devolve o realizado por conta contábil, sem o agrupamento.
export async function listarRealizado({ ano, filialId }) {
  const cabecalho = objeto("DB_TABELA_LANCAMENTO", "dbo.CTB_LANCAMENTO");
  const itens = objeto("DB_TABELA_LANCAMENTO_ITEM", "dbo.CTB_LANCAMENTO_ITEM");
  return query(
    `
    SELECT
      RTRIM(i.CONTA_CONTABIL)   AS conta,
      RTRIM(l.COD_FILIAL)       AS filial,
      MONTH(l.DATA_LANCAMENTO)  AS mes,
      SUM(ISNULL(i.CREDITO, 0)) AS credito,
      SUM(ISNULL(i.DEBITO, 0))  AS debito
    FROM ${itens} AS i
    INNER JOIN ${cabecalho} AS l
      ON l.LANCAMENTO = i.LANCAMENTO
     AND l.EMPRESA    = i.EMPRESA
    WHERE YEAR(l.DATA_LANCAMENTO) = @ano
      AND (@filial IS NULL OR RTRIM(l.COD_FILIAL) = @filial)
    GROUP BY RTRIM(i.CONTA_CONTABIL), RTRIM(l.COD_FILIAL), MONTH(l.DATA_LANCAMENTO)
    ORDER BY conta, mes
  `,
    { ano, filial: filialId ?? null }
  );
}
