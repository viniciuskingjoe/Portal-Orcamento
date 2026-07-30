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

// Qual visão contábil do ERP fornece as contas do portal. Na KINGEJOE é a "07".
function visaoContabil() {
  const valor = process.env.DB_VISAO_CONTABIL?.trim();
  if (!valor) {
    const erro = new Error("DB_VISAO_CONTABIL não está definida no .env.");
    erro.status = 503;
    throw erro;
  }
  return valor;
}

// Classificações da visão contábil — a árvore que o usuário monta nos módulos.
//
// Só as que têm ponto no código. A visão 07 guarda dois esquemas na mesma
// tabela: 969 linhas do plano de contas posicional (`1`, `11`, `111101`) e 142
// da estrutura gerencial (`3.1`, `3.1.1`, `3.1.1.1.02`). É a segunda que
// interessa; sem o filtro a lista viria com 1111 itens misturados.
//
// `INDICA_CTRL_ORCAMENTO` NÃO entra no filtro: na visão 07 é 0 em todas as
// linhas, e filtrar por ele devolveria lista vazia.
//
// `sintetica` vem de CLASSIFICACAO_ANALITICA: 1 nos grupos (3.1, 3.1.1), 0 nas
// folhas, que são as que recebem lançamento.
//
// `totalizaEm` volta só como informação — é para onde o valor totaliza no DRE,
// NÃO o pai da árvore. Ex.: "3.1.1.3" totaliza em "3.1.2", mas na árvore é filho
// de "3.1.1". A hierarquia se monta pelo prefixo do código, no front.
export async function listarContas() {
  const tabela = objeto("DB_VIEW_CONTAS", "dbo.CTB_VISAO");
  return query(
    `
    SELECT
      RTRIM(CLASSIFICACAO)                         AS codigo,
      RTRIM(DESCR_CONTA)                           AS descricao,
      NULLIF(RTRIM(CLASSIFICACAO_TOTALIZA_EM), '') AS totalizaEm,
      CLASSIFICACAO_ANALITICA                      AS sintetica
    FROM ${tabela}
    WHERE RTRIM(VISAO_CONTABIL) = @visao
      AND CHARINDEX('.', RTRIM(CLASSIFICACAO)) > 0
    ORDER BY CLASSIFICACAO
  `,
    { visao: visaoContabil() }
  );
}

// Filiais do ERP: `FILIAL` é o nome, `COD_FILIAL` é o código.
//
// O id é o COD_FILIAL, não o nome: é por ele que o realizado vem agrupado
// (CTB_LANCAMENTO.COD_FILIAL) e é ele que entra na chave do planejado. Nome muda,
// código não. Verificado no banco: 25 filiais, COD_FILIAL único e nunca vazio.
//
// Ordenado por nome, que é o que aparece na tela.
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

// Centros de custo do ERP: `CENTRO_CUSTO` é o código, `DESC_CENTRO_CUSTO` o nome.
//
// Só os ativos. Dos 42 cadastrados, 5 estão com INATIVA = 1 (BOOTCAMP,
// TRANSPORTE e outros) — orçar contra centro desativado não faz sentido.
export async function listarCentrosDeCusto() {
  const tabela = objeto("DB_VIEW_CENTROS", "dbo.CTB_CENTRO_CUSTO");
  return query(`
    SELECT
      RTRIM(CENTRO_CUSTO)      AS id,
      RTRIM(DESC_CENTRO_CUSTO) AS nome,
      INATIVA                  AS inativa
    FROM ${tabela}
    WHERE ISNULL(INATIVA, 0) = 0
    ORDER BY DESC_CENTRO_CUSTO
  `);
}

// Realizado mensal por CLASSIFICAÇÃO da visão contábil e filial.
//
// O de/para conta contábil -> classificação vive em dbo.CTB_PLANO_VISAO, com
// OPERADOR (+/-) e PORCENTAGEM de rateio. O join é feito aqui em vez de usar
// dbo.W_CTB_LANCAMENTO_CLASSIFICACAO porque aquela view arrasta 48 colunas
// (nomes de filial, centro de custo, NIVEL1..12) que não são usadas: mesmo
// resultado, 0,9 s contra 17,5 s.
//
// Filtro por range de data, não YEAR(DATA_LANCAMENTO) — com a função em volta da
// coluna o SQL Server não usa índice e a consulta estourava o timeout.
//
// Débito e crédito voltam separados, já com sinal e rateio aplicados. Quem
// consome decide a leitura: receita usa crédito − débito, despesa inverte.
export async function listarRealizado({ ano, filialId }) {
  const cabecalho = objeto("DB_TABELA_LANCAMENTO", "dbo.CTB_LANCAMENTO");
  const itens = objeto("DB_TABELA_LANCAMENTO_ITEM", "dbo.CTB_LANCAMENTO_ITEM");
  const mapa = objeto("DB_TABELA_PLANO_VISAO", "dbo.CTB_PLANO_VISAO");

  const sinal = (coluna) =>
    `SUM(ISNULL(${coluna}, 0) * ISNULL(pv.PORCENTAGEM, 100) / 100.0
        * CASE WHEN RTRIM(pv.OPERADOR) = '-' THEN -1 ELSE 1 END)`;

  return query(
    `
    SELECT
      RTRIM(pv.CLASSIFICACAO)  AS classificacao,
      RTRIM(l.COD_FILIAL)      AS filial,
      MONTH(l.DATA_LANCAMENTO) AS mes,
      ${sinal("i.DEBITO")}     AS debito,
      ${sinal("i.CREDITO")}    AS credito
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
    GROUP BY RTRIM(pv.CLASSIFICACAO), RTRIM(l.COD_FILIAL), MONTH(l.DATA_LANCAMENTO)
    ORDER BY classificacao, mes
  `,
    {
      visao: visaoContabil(),
      // Date vira DateTime2(3) no bind (ver sqlserver.js).
      inicio: new Date(Date.UTC(ano, 0, 1)),
      fim: new Date(Date.UTC(ano + 1, 0, 1)),
      filial: filialId ?? null,
    }
  );
}
