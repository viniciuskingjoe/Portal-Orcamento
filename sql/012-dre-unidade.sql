/* ===========================================================================
   DRE — unidade da linha (valor em R$ ou percentual)
   Depende de: 011-dre.sql

   Toda linha "origem: modulo" é sempre R$ — soma contas do orçamento. Uma
   linha "origem: formula", porém, pode ser uma razão entre outras duas
   linhas (ex.: dedução / receita líquida × 100) — o Scoreplan mostra essas
   como uma linha "%" logo abaixo da linha que ela descreve. Sem esta coluna
   o valor calculado (um número entre 0 e 100, tipicamente) seria formatado
   como reais na leitura, o que não faz sentido.

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

IF COL_LENGTH('dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA', 'UNIDADE') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA
    ADD UNIDADE VARCHAR(12) NOT NULL
        CONSTRAINT DF_ORC_DRE_L_UNIDADE DEFAULT ('moeda');
  PRINT 'Coluna UNIDADE adicionada a KING_PORTAL_ORC_VISAO_DRE_LINHA.';
END
ELSE
  PRINT 'KING_PORTAL_ORC_VISAO_DRE_LINHA.UNIDADE ja existe — nada a fazer.';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KING_PORTAL_ORC_VISAO_DRE_LINHA_UNIDADE'
)
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA
    ADD CONSTRAINT CK_KING_PORTAL_ORC_VISAO_DRE_LINHA_UNIDADE
        CHECK (UNIDADE IN ('moeda', 'percentual'));
END
GO
