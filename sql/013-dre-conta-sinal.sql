/* ===========================================================================
   DRE — sinal por conta dentro da linha
   Depende de: 011-dre.sql

   Até aqui, uma linha "origem: modulo" tinha UM sinal só (SINAL na própria
   KING_PORTAL_ORC_VISAO_DRE_LINHA) valendo pra TODAS as contas escolhidas —
   não dava pra somar uma conta e subtrair outra na mesma linha.

   Cada conta escolhida ganha o próprio sinal aqui. O SINAL da linha
   continua existindo e vale só como fallback: quando NENHUMA conta é
   escolhida (a linha soma o módulo inteiro), é ele que decide soma ou
   subtrai.

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

IF COL_LENGTH('dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA', 'SINAL') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA
    ADD SINAL SMALLINT NOT NULL
        CONSTRAINT DF_ORC_DRE_LC_SINAL DEFAULT (1);
  PRINT 'Coluna SINAL adicionada a KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA.';
END
ELSE
  PRINT 'KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA.SINAL ja existe — nada a fazer.';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA_SINAL'
)
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA
    ADD CONSTRAINT CK_KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA_SINAL
        CHECK (SINAL IN (1, -1));
END
GO
