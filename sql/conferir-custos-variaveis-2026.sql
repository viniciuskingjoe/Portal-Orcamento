/* ===========================================================================
   CONFERIR O REALIZADO DE CUSTOS VARIÁVEIS — 2026

   Reproduz exatamente a consulta que o portal usa (server/consultas.js,
   listarRealizado): mesmo join, mesmo rateio de centro de custo, mesmos tipos
   de lançamento excluídos e mesma aplicação de PORCENTAGEM/OPERADOR.

   Para que serve: em HOMOLOGACAO_RT_LINX o portal mostra, para custos
   variáveis, 2.390.890,85 em janeiro/2026 contra 2.499.264,54 do Scoreplan —
   uma diferença de 108.373,69 que não corresponde a nenhuma conta.

   Rodar em KINGEJOE (produção) responde qual das duas causas é:

     - se o CPV de janeiro vier MAIOR que 2.364.972,57, a homologação é uma
       cópia defasada e não há nada a corrigir no portal;
     - se vier igual, a contabilidade não explica o número do Scoreplan, e a
       pergunta passa a ser o que ele soma além de CPV e CMV.

   SOMENTE LEITURA. Nenhum INSERT, UPDATE ou DELETE.
   =========================================================================== */

SET NOCOUNT ON;

DECLARE @visao   VARCHAR(10)  = '25';
DECLARE @inicio  DATETIME2(3) = '2026-01-01';
DECLARE @fim     DATETIME2(3) = '2027-01-01';

/* Os mesmos de DB_TIPOS_LANCAMENTO_EXCLUIDOS: encerramento e apuração, que
   duplicariam o movimento do ano. */
DECLARE @excluidos TABLE (TIPO VARCHAR(10) PRIMARY KEY);
INSERT INTO @excluidos (TIPO) VALUES ('ELD'), ('LAC'), ('ELC'), ('LAD');

/* Tabela temporária, e não CTE: uma CTE vale só para o comando seguinte, e
   aqui três consultas leem o mesmo movimento. */
IF OBJECT_ID('tempdb..#movimento') IS NOT NULL DROP TABLE #movimento;

  SELECT
    RTRIM(pv.CLASSIFICACAO)  AS classificacao,
    MONTH(l.DATA_LANCAMENTO) AS mes,
    SUM(ISNULL(i.DEBITO, 0)
        * ISNULL(pv.PORCENTAGEM, 100) / 100.0
        * ISNULL(cri.PORCENTAGEM, 100) / 100.0
        * CASE WHEN RTRIM(pv.OPERADOR) = '-' THEN -1 ELSE 1 END)  AS debito,
    SUM(ISNULL(i.CREDITO, 0)
        * ISNULL(pv.PORCENTAGEM, 100) / 100.0
        * ISNULL(cri.PORCENTAGEM, 100) / 100.0
        * CASE WHEN RTRIM(pv.OPERADOR) = '-' THEN -1 ELSE 1 END)  AS credito
  INTO #movimento
  FROM dbo.CTB_LANCAMENTO_ITEM AS i
  INNER JOIN dbo.CTB_LANCAMENTO AS l
    ON l.LANCAMENTO = i.LANCAMENTO
   AND l.EMPRESA    = i.EMPRESA
  INNER JOIN dbo.CTB_PLANO_VISAO AS pv
    ON pv.CONTA_CONTABIL = i.CONTA_CONTABIL
   AND pv.VISAO_CONTABIL = @visao
  LEFT JOIN dbo.CTB_CENTRO_CUSTO_RATEIO_ITEM AS cri
    ON RTRIM(cri.RATEIO_CENTRO_CUSTO) = RTRIM(i.RATEIO_CENTRO_CUSTO)
  WHERE l.DATA_LANCAMENTO >= @inicio
    AND l.DATA_LANCAMENTO <  @fim
    AND RTRIM(UPPER(ISNULL(i.LX_TIPO_LANCAMENTO, ''))) NOT IN (SELECT TIPO FROM @excluidos)
    AND RTRIM(pv.CLASSIFICACAO) LIKE '4.1.%'
  GROUP BY RTRIM(pv.CLASSIFICACAO), MONTH(l.DATA_LANCAMENTO);

/* -------------------------------------------------------------------------
   1) Conta a conta. Despesa é DÉBITO menos CRÉDITO.
   ------------------------------------------------------------------------- */
SELECT
  m.classificacao,
  RTRIM(v.DESCR_CONTA)                        AS descricao,
  m.mes,
  CAST(m.debito - m.credito AS DECIMAL(18,2)) AS valor,
  CASE WHEN m.classificacao IN (
         '4.1.1.01.001',   -- CUSTOS DOS PRODUTOS VENDIDOS - CPV
         '4.1.2.01.001',   -- CUSTOS DAS MERCADORIAS VENDIDAS - CMV
         '4.1.2.02.001',
         '4.1.3.01.001',
         '4.1.5.01.040')
       THEN 'custos-variaveis' ELSE '' END    AS modulo_do_portal
FROM #movimento m
LEFT JOIN dbo.CTB_VISAO v
  ON RTRIM(v.CLASSIFICACAO) = m.classificacao
 AND RTRIM(v.VISAO_CONTABIL) = @visao
WHERE m.mes BETWEEN 1 AND 3
  AND ABS(m.debito - m.credito) > 0.005
ORDER BY m.mes, m.classificacao;

/* -------------------------------------------------------------------------
   2) O total do módulo, mês a mês — é este número que aparece na coluna
      REALIZADO da tela "Custos variáveis".

      Na homologação dá:  01 = 2.390.890,85   02 = 5.469.655,16   03 = 6.174.669,71
      O Scoreplan mostra: 01 = 2.499.264,54   02 = 5.479.777,78   03 = 6.480.634,73
   ------------------------------------------------------------------------- */
SELECT
  m.mes,
  CAST(SUM(m.debito - m.credito) AS DECIMAL(18,2)) AS realizado_custos_variaveis
FROM #movimento m
WHERE m.mes BETWEEN 1 AND 3
  AND m.classificacao IN (
        '4.1.1.01.001', '4.1.2.01.001', '4.1.2.02.001', '4.1.3.01.001', '4.1.5.01.040')
GROUP BY m.mes
ORDER BY m.mes;

/* -------------------------------------------------------------------------
   3) Até quando a contabilidade foi lançada. Se a produção tiver lançamento
      de custo em meses que a homologação não tem, a cópia é que está velha.
   ------------------------------------------------------------------------- */
SELECT
  MONTH(l.DATA_LANCAMENTO) AS mes,
  COUNT(*)                 AS lancamentos
FROM dbo.CTB_LANCAMENTO AS l
WHERE l.DATA_LANCAMENTO >= @inicio
  AND l.DATA_LANCAMENTO <  @fim
GROUP BY MONTH(l.DATA_LANCAMENTO)
ORDER BY mes;
