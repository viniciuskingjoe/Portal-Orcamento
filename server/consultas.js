import { query } from "./sqlserver.js";

// ============================================================================
// Consultas ao ERP (Linx) — somente SELECT, nunca alterar tabela do ERP.
//
// Objetos usados, confirmados no banco KINGEJOE:
//   dbo.CTB_VISAO_CONTABIL     visões contábeis e seus nomes
//   dbo.CTB_VISAO              classificações de cada visão
//   dbo.CTB_PLANO_VISAO        de/para conta contábil -> classificação
//   dbo.FILIAIS                filiais
//   dbo.CTB_CENTRO_CUSTO       centros de custo
//   dbo.CTB_LANCAMENTO(_ITEM)  lançamentos contábeis (realizado)
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

// Tipos de lançamento que não são movimento do período e precisam ficar de fora
// do realizado.
//
// ELD = encerramento do exercício. Em dezembro o Linx zera as contas de
// resultado com um débito do tamanho do ano inteiro (R$ 115 mi em 2025). Sem
// excluir, dezembro fica com sinal invertido e o total do ano some.
function tiposExcluidos() {
  const bruto = process.env.DB_TIPOS_LANCAMENTO_EXCLUIDOS ?? "ELD";
  return bruto
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function visaoPadrao() {
  const valor = process.env.DB_VISAO_CONTABIL?.trim();
  if (!valor) {
    const erro = new Error("DB_VISAO_CONTABIL não está definida no .env.");
    erro.status = 503;
    throw erro;
  }
  return valor;
}

// Visões contábeis disponíveis, com o nome que o Linx já usa. É a lista que o
// portal oferece na criação de uma visão.
export async function listarVisoesContabeis() {
  const cabecalho = objeto("DB_TABELA_VISAO_CONTABIL", "dbo.CTB_VISAO_CONTABIL");
  const classificacoes = objeto("DB_VIEW_CONTAS", "dbo.CTB_VISAO");

  return query(`
    SELECT
      RTRIM(v.VISAO_CONTABIL)     AS id,
      RTRIM(v.VISAO_DENOMINACAO)  AS nome,
      c.classificacoes            AS classificacoes,
      c.folhas                    AS folhas
    FROM ${cabecalho} AS v
    INNER JOIN (
      SELECT RTRIM(VISAO_CONTABIL) AS visao,
             COUNT(*) AS classificacoes,
             SUM(CASE WHEN CLASSIFICACAO_ANALITICA = 0 THEN 1 ELSE 0 END) AS folhas
      FROM ${classificacoes}
      WHERE CHARINDEX('.', RTRIM(CLASSIFICACAO)) > 0
      GROUP BY RTRIM(VISAO_CONTABIL)
    ) AS c ON c.visao = RTRIM(v.VISAO_CONTABIL)
    WHERE c.classificacoes > 0
    ORDER BY v.VISAO_DENOMINACAO
  `);
}

// Classificações de uma visão contábil — a árvore que o usuário monta nos
// módulos.
//
// Só as que têm ponto no código. A CTB_VISAO guarda dois esquemas na mesma
// tabela: o plano de contas posicional (`111101`) e a estrutura gerencial
// (`3.1.1.01.001`). É a segunda que interessa.
//
// `sintetica` vem de CLASSIFICACAO_ANALITICA: 1 nos grupos, 0 nas folhas — que
// são as únicas que recebem lançamento e as únicas que a tela de plano oferece.
//
// `totalizaEm` volta só como informação: é para onde o valor totaliza no DRE,
// NÃO o pai da árvore. A hierarquia se monta pelo prefixo do código, no front.
export async function listarContas({ visao } = {}) {
  const tabela = objeto("DB_VIEW_CONTAS", "dbo.CTB_VISAO");
  return query(
    `
    SELECT
      RTRIM(CLASSIFICACAO)                         AS codigo,
      RTRIM(DESCR_CONTA)                           AS descricao,
      NULLIF(RTRIM(CLASSIFICACAO_TOTALIZA_EM), '') AS totalizaEm,
      CLASSIFICACAO_ANALITICA                      AS sintetica,
      NULLIF(RTRIM(LX_GRUPO_CONTABIL), '')         AS grupo
    FROM ${tabela}
    WHERE RTRIM(VISAO_CONTABIL) = @visao
      AND CHARINDEX('.', RTRIM(CLASSIFICACAO)) > 0
    ORDER BY CLASSIFICACAO
  `,
    { visao: visao?.trim() || visaoPadrao() }
  );
}

// Filiais do ERP: `FILIAL` é o nome, `COD_FILIAL` é o código.
//
// O id é o COD_FILIAL, não o nome: é por ele que o realizado vem agrupado e é
// ele que entra na chave do planejado. Nome muda, código não.
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
    ORDER BY FILIAL
  `);
}

// Centros de custo ativos do ERP.
export async function listarCentrosDeCusto() {
  const tabela = objeto("DB_VIEW_CENTROS", "dbo.CTB_CENTRO_CUSTO");
  return query(`
    SELECT
      RTRIM(CENTRO_CUSTO)      AS id,
      RTRIM(DESC_CENTRO_CUSTO) AS nome
    FROM ${tabela}
    WHERE ISNULL(INATIVA, 0) = 0
    ORDER BY DESC_CENTRO_CUSTO
  `);
}

// Realizado mensal por classificação, filial e centro de custo.
//
// O de/para conta contábil -> classificação vive em dbo.CTB_PLANO_VISAO, com
// OPERADOR (+/-) e PORCENTAGEM de rateio. O join é feito aqui em vez de usar
// dbo.W_CTB_LANCAMENTO_CLASSIFICACAO porque aquela view arrasta 48 colunas que
// não são usadas: mesmo resultado, 0,9 s contra 17,5 s.
//
// Filtro por range de data, não YEAR(DATA_LANCAMENTO) — com a função em volta da
// coluna o SQL Server não usa índice e a consulta estoura o timeout.
//
// Débito e crédito voltam separados, já com sinal e rateio aplicados. Quem
// consome decide a leitura: receita usa crédito − débito, despesa inverte.
export async function listarRealizado({ ano, filialId, visao } = {}) {
  const cabecalho = objeto("DB_TABELA_LANCAMENTO", "dbo.CTB_LANCAMENTO");
  const itens = objeto("DB_TABELA_LANCAMENTO_ITEM", "dbo.CTB_LANCAMENTO_ITEM");
  const mapa = objeto("DB_TABELA_PLANO_VISAO", "dbo.CTB_PLANO_VISAO");

  const excluidos = tiposExcluidos();
  const parametros = {
    visao: visao?.trim() || visaoPadrao(),
    // Date vira DateTime2(3) no bind (ver sqlserver.js).
    inicio: new Date(Date.UTC(ano, 0, 1)),
    fim: new Date(Date.UTC(ano + 1, 0, 1)),
    filial: filialId ?? null,
  };
  excluidos.forEach((tipo, indice) => {
    parametros[`excluido${indice}`] = tipo;
  });
  const filtroTipos = excluidos.length
    ? `AND RTRIM(UPPER(ISNULL(i.LX_TIPO_LANCAMENTO, ''))) NOT IN (${excluidos
        .map((_, indice) => `@excluido${indice}`)
        .join(", ")})`
    : "";

  const sinal = (coluna) =>
    `SUM(ISNULL(${coluna}, 0) * ISNULL(pv.PORCENTAGEM, 100) / 100.0
        * CASE WHEN RTRIM(pv.OPERADOR) = '-' THEN -1 ELSE 1 END)`;

  return query(
    `
    SELECT
      RTRIM(pv.CLASSIFICACAO)                        AS classificacao,
      RTRIM(l.COD_FILIAL)                            AS filial,
      RTRIM(ISNULL(i.RATEIO_CENTRO_CUSTO, ''))       AS centro,
      MONTH(l.DATA_LANCAMENTO)                       AS mes,
      ${sinal("i.DEBITO")}                           AS debito,
      ${sinal("i.CREDITO")}                          AS credito
    FROM ${itens} AS i
    INNER JOIN ${cabecalho} AS l
      ON l.LANCAMENTO = i.LANCAMENTO
     AND l.EMPRESA    = i.EMPRESA
    INNER JOIN ${mapa} AS pv
      ON pv.CONTA_CONTABIL = i.CONTA_CONTABIL
     AND pv.VISAO_CONTABIL = @visao
    WHERE l.DATA_LANCAMENTO >= @inicio
      AND l.DATA_LANCAMENTO <  @fim
      AND (@filial IS NULL OR RTRIM(l.COD_FILIAL) = @filial)
      ${filtroTipos}
    GROUP BY RTRIM(pv.CLASSIFICACAO), RTRIM(l.COD_FILIAL),
             RTRIM(ISNULL(i.RATEIO_CENTRO_CUSTO, '')), MONTH(l.DATA_LANCAMENTO)
    ORDER BY classificacao, mes
  `,
    parametros
  );
}
