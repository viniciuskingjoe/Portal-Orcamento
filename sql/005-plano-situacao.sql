/* ===========================================================================
   DESATIVAR PLANO EM VEZ DE EXCLUIR
   Depende de: 003-orcamento-dados.sql

   Excluir um plano levava junto todo o planejado dele — e o que se quer, na
   prática, é tirar da lista um cenário que não vale mais sem perder o trabalho
   de quem o montou. Orçamento antigo é referência: some do caminho, mas ainda
   responde "quanto a gente tinha previsto em 2026?".

   Rodar uma vez, no banco em uso. Idempotente.
   =========================================================================== */

/* Planos que já existem nascem ativos: é o que eles eram até agora. */
IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'SITUACAO') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO
    ADD SITUACAO VARCHAR(20) NOT NULL
        CONSTRAINT DF_ORC_PLANO_SITUACAO DEFAULT ('ativo');
END
GO

/* Quem desativou e quando — sem isso, um plano some da lista e ninguém sabe
   dizer se foi decisão de alguém ou engano. */
IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'SITUACAO_EM') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO ADD SITUACAO_EM DATETIME2(3) NULL;
END
GO

IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'SITUACAO_POR') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO ADD SITUACAO_POR VARCHAR(50) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KING_PORTAL_ORC_PLANO_SITUACAO'
)
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO
    ADD CONSTRAINT CK_KING_PORTAL_ORC_PLANO_SITUACAO
        CHECK (SITUACAO IN ('ativo', 'inativo'));
END
GO

PRINT 'Situacao do plano criada/verificada.';
GO
