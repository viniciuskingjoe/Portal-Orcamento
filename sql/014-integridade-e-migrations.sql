/* ============================================================================
   014 — Ledger de migrations e exclusividade da folha

   Aplicar depois de 001–013. O ledger torna verificável qual evolução foi
   aplicada; o trigger é a última barreira contra a mesma conta aparecer em
   Despesas com pessoal e Despesas operacionais no mesmo centro.
   ============================================================================ */

SET XACT_ABORT ON;
GO

IF OBJECT_ID('dbo.KING_PORTAL_ORC_MIGRATION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_MIGRATION (
    VERSAO       SMALLINT      NOT NULL,
    NOME         VARCHAR(120)  NOT NULL,
    APLICADA_EM  DATETIME2(3)  NOT NULL CONSTRAINT DF_ORC_MIGRATION_APLICADA DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_KING_PORTAL_ORC_MIGRATION PRIMARY KEY CLUSTERED (VERSAO)
  );
END
GO

IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_CONTA', 'U') IS NULL
  THROW 50001, 'Aplique as migrations 001-013 antes da 014.', 1;
GO

CREATE OR ALTER TRIGGER dbo.TR_KING_PORTAL_ORC_VISAO_CONTA_EXCLUSIVA
ON dbo.KING_PORTAL_ORC_VISAO_CONTA
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1
      FROM inserted AS nova
      INNER JOIN dbo.KING_PORTAL_ORC_VISAO_CONTA AS outra WITH (UPDLOCK, HOLDLOCK)
              ON outra.VISAO_ID = nova.VISAO_ID
             AND outra.COD_FILIAL = nova.COD_FILIAL
             AND outra.CENTRO_CUSTO = nova.CENTRO_CUSTO
             AND outra.CLASSIFICACAO = nova.CLASSIFICACAO
             AND outra.MODULO <> nova.MODULO
     WHERE nova.MODULO IN ('despesas-pessoal', 'despesas-operacionais')
       AND outra.MODULO IN ('despesas-pessoal', 'despesas-operacionais')
  )
    THROW 50002, 'A conta nao pode ficar em Pessoal e Operacionais no mesmo centro.', 1;
END
GO

DECLARE @migrations TABLE (VERSAO SMALLINT, NOME VARCHAR(120));
INSERT INTO @migrations (VERSAO, NOME) VALUES
  (1,  'identidade'),
  (2,  'orcamento-acesso'),
  (3,  'orcamento-dados'),
  (4,  'orcamento-linx'),
  (5,  'plano-situacao'),
  (6,  'grupo-centro-custo'),
  (7,  'qtde-funcionario'),
  (8,  'qtde-funcionario-portal'),
  (9,  'funcionarios'),
  (10, 'formula-conta'),
  (11, 'dre'),
  (12, 'dre-unidade'),
  (13, 'dre-conta-sinal'),
  (14, 'integridade-e-migrations');

INSERT INTO dbo.KING_PORTAL_ORC_MIGRATION (VERSAO, NOME)
SELECT origem.VERSAO, origem.NOME
  FROM @migrations AS origem
 WHERE NOT EXISTS (
   SELECT 1 FROM dbo.KING_PORTAL_ORC_MIGRATION AS destino
    WHERE destino.VERSAO = origem.VERSAO
 );
GO

PRINT 'Migration 014 aplicada com sucesso.';
GO
