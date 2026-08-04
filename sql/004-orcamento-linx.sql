/* ===========================================================================
   PUBLICAÇÃO DO PLANEJADO NO ORÇAMENTO DO LINX
   Depende de: 003-orcamento-dados.sql

   Cada plano do portal ganha um orçamento próprio no ERP, em
   dbo.CTB_ORCAMENTO, e o planejado é publicado em dbo.CTB_CONTA_ORCAMENTO —
   que é de onde o Power BI já lê.

   Este script NÃO cria nada no Linx. Só acrescenta ao portal o vínculo com o
   orçamento de lá e o registro da última publicação. Quem cria a linha em
   CTB_ORCAMENTO é o portal, ao criar o plano.

   ATENÇÃO AO STATUS
   CTB_CONTA_ORCAMENTO tem o gatilho LXI_CTB_CONTA_ORCAMENTO, FOR INSERT, que
   ACUMULA em CTB_SALDO_ORCAMENTO (VALOR_ORCADO = VALOR_ORCADO + VALOR) quando o
   orçamento está com LX_STATUS_ORCAMENTO = 2 (ATIVO). Não existe gatilho de
   DELETE, então apagar as linhas não desfaz o saldo — republicar inflaria o
   saldo do Linx sem volta.

   Por isso o orçamento criado pelo portal fica sempre em COD_STATUS_ORCAMENTO
   = 1 (EM ELABORAÇÃO), em que o gatilho não faz nada, e o servidor recusa
   publicar se o status tiver mudado.

   Rodar uma vez, no banco em uso. Idempotente.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   Vínculo com o orçamento do ERP e rastro da publicação.

   `ID_ORCAMENTO` é NULL enquanto o plano não tiver orçamento no Linx — planos
   antigos e planos que ninguém publicou ficam assim, e é o que distingue "nunca
   publicado" de "publicado e depois alterado".

   As três colunas de publicação existem para a tela poder dizer "publicado em X
   por Y" em vez de deixar quem lança adivinhando se o Power BI já viu o número.
   --------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'ID_ORCAMENTO') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO ADD ID_ORCAMENTO INT NULL;
END
GO

IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'PUBLICADO_EM') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO ADD PUBLICADO_EM DATETIME2(3) NULL;
END
GO

IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'PUBLICADO_POR') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO ADD PUBLICADO_POR VARCHAR(50) NULL;
END
GO

IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANO', 'PUBLICADO_LINHAS') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANO ADD PUBLICADO_LINHAS INT NULL;
END
GO

/* Dois planos do portal não podem apontar para o mesmo orçamento do Linx: a
   publicação apaga tudo do orçamento antes de inserir, e o segundo plano
   levaria o primeiro embora sem avisar.

   Índice filtrado porque a maioria dos planos tem NULL, e NULL não colide. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
   WHERE name = 'UX_KING_PORTAL_ORC_PLANO_ORCAMENTO'
     AND object_id = OBJECT_ID('dbo.KING_PORTAL_ORC_PLANO')
)
BEGIN
  CREATE UNIQUE INDEX UX_KING_PORTAL_ORC_PLANO_ORCAMENTO
      ON dbo.KING_PORTAL_ORC_PLANO (ID_ORCAMENTO)
   WHERE ID_ORCAMENTO IS NOT NULL;
END
GO

PRINT 'Vinculo com o orcamento do Linx criado/verificado.';
GO
