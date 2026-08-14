/* ===========================================================================
   O QUE EXISTE NOS GRUPOS DE PESSOAL — 421.10, 431.01, 441.01

   Somente leitura. Nenhum INSERT/UPDATE/DELETE.

   Contexto: no Scoreplan esses três grupos aparecem DENTRO de Despesas
   operacionais (441 > 441.01 DESPESAS COM PESSOAL - ADM) e também têm tela
   própria de pessoal, com quantidade de funcionários. Ou seja: mesma conta,
   duas telas — não são módulos concorrentes. Antes de decidir como o portal vai
   tratar isso, é preciso ver o que de fato tem lá dentro.

   Ajuste a visão e o plano nas duas primeiras linhas se necessário.
   =========================================================================== */

DECLARE @visao  VARCHAR(30) = '25';  -- DB_VISAO_CONTABIL do .env
DECLARE @plano  INT         = NULL;  -- NULL = todos os planos do portal

/* ---------------------------------------------------------------------------
   1) AS CONTAS DO PLANO CONTÁBIL
   O que o ERP tem nos três grupos, analíticas e sintéticas.
   --------------------------------------------------------------------------- */
SELECT
  RTRIM(CLASSIFICACAO)  AS conta,
  RTRIM(DESCR_CONTA)    AS descricao,
  CASE WHEN CLASSIFICACAO_ANALITICA = 1 THEN 'sintetica' ELSE 'analitica' END AS tipo,
  NULLIF(RTRIM(CLASSIFICACAO_TOTALIZA_EM), '') AS totaliza_em
FROM dbo.CTB_VISAO
WHERE RTRIM(VISAO_CONTABIL) = @visao
  AND (   RTRIM(CLASSIFICACAO) LIKE '4.2.1.10%'
       OR RTRIM(CLASSIFICACAO) LIKE '4.3.1.01%'
       OR RTRIM(CLASSIFICACAO) LIKE '4.4.1.01%')
ORDER BY CLASSIFICACAO;

/* ---------------------------------------------------------------------------
   2) EM QUE MÓDULO O PORTAL COLOCOU CADA UMA
   Se aparecer só um módulo, a conta é exclusiva dele hoje. Se aparecer em dois,
   ela já está compartilhada — e aí o DRE precisa somar por conta, não por
   módulo, para não contar duas vezes.
   --------------------------------------------------------------------------- */
SELECT
  LEFT(RTRIM(vc.CLASSIFICACAO), 8) AS grupo,
  vc.MODULO                        AS modulo,
  COUNT(DISTINCT RTRIM(vc.CLASSIFICACAO)) AS contas,
  COUNT(*)                                AS linhas_de_visao
FROM dbo.KING_PORTAL_ORC_VISAO_CONTA AS vc
WHERE RTRIM(vc.CLASSIFICACAO) LIKE '4.2.1.10%'
   OR RTRIM(vc.CLASSIFICACAO) LIKE '4.3.1.01%'
   OR RTRIM(vc.CLASSIFICACAO) LIKE '4.4.1.01%'
GROUP BY LEFT(RTRIM(vc.CLASSIFICACAO), 8), vc.MODULO
ORDER BY grupo, modulo;

/* ---------------------------------------------------------------------------
   3) CONTA QUE ESTÁ EM MAIS DE UM MÓDULO
   Vazio = nenhuma sobreposição hoje.
   --------------------------------------------------------------------------- */
SELECT
  RTRIM(CLASSIFICACAO) AS conta,
  COUNT(DISTINCT MODULO) AS quantos_modulos,
  STRING_AGG(CONVERT(VARCHAR(MAX), MODULO), ', ') AS modulos
FROM (SELECT DISTINCT RTRIM(CLASSIFICACAO) AS CLASSIFICACAO, MODULO
        FROM dbo.KING_PORTAL_ORC_VISAO_CONTA) AS d
GROUP BY RTRIM(CLASSIFICACAO)
HAVING COUNT(DISTINCT MODULO) > 1
ORDER BY conta;

/* ---------------------------------------------------------------------------
   4) PLANEJADO POR GRUPO E MÊS
   O total que hoje sai desses grupos, para comparar com a tela do Scoreplan.
   --------------------------------------------------------------------------- */
SELECT
  p.MODULO                        AS modulo,
  LEFT(RTRIM(p.CLASSIFICACAO), 8) AS grupo,
  p.MES                           AS mes,
  COUNT(*)                        AS celulas,
  CAST(SUM(p.VALOR) AS DECIMAL(18,2)) AS planejado
FROM dbo.KING_PORTAL_ORC_PLANEJADO AS p
WHERE (@plano IS NULL OR p.PLANO_ID = @plano)
  AND (   RTRIM(p.CLASSIFICACAO) LIKE '4.2.1.10%'
       OR RTRIM(p.CLASSIFICACAO) LIKE '4.3.1.01%'
       OR RTRIM(p.CLASSIFICACAO) LIKE '4.4.1.01%')
GROUP BY p.MODULO, LEFT(RTRIM(p.CLASSIFICACAO), 8), p.MES
ORDER BY modulo, grupo, mes;

/* ---------------------------------------------------------------------------
   5) POR CENTRO DE CUSTO, NO ANO TODO
   É esta granularidade que a quantidade de funcionários vai precisar: cada
   linha aqui é um lugar onde alguém teria que informar um número.
   --------------------------------------------------------------------------- */
SELECT
  p.COD_FILIAL                    AS filial,
  p.CENTRO_CUSTO                  AS centro,
  LEFT(RTRIM(p.CLASSIFICACAO), 8) AS grupo,
  COUNT(DISTINCT RTRIM(p.CLASSIFICACAO)) AS contas,
  COUNT(DISTINCT p.MES)                  AS meses,
  CAST(SUM(p.VALOR) AS DECIMAL(18,2))    AS planejado
FROM dbo.KING_PORTAL_ORC_PLANEJADO AS p
WHERE (@plano IS NULL OR p.PLANO_ID = @plano)
  AND (   RTRIM(p.CLASSIFICACAO) LIKE '4.2.1.10%'
       OR RTRIM(p.CLASSIFICACAO) LIKE '4.3.1.01%'
       OR RTRIM(p.CLASSIFICACAO) LIKE '4.4.1.01%')
GROUP BY p.COD_FILIAL, p.CENTRO_CUSTO, LEFT(RTRIM(p.CLASSIFICACAO), 8)
ORDER BY filial, centro, grupo;
