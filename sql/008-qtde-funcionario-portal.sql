/* ===========================================================================
   QTDE_FUNCIONARIO em KING_PORTAL_ORC_PLANEJADO
   Depende de: 003-orcamento-dados.sql

   O par da U_QTDE_FUNCIONARIO do ERP (007). Aqui é onde o número vive enquanto
   se orça; a sincronização o copia para CTB_CONTA_ORCAMENTO.

   POR QUE NA MESMA TABELA DO VALOR
   Decisão de quem toca o projeto: sem tabela nova. O número de funcionários é
   do conjunto (filial, centro, GRUPO de conta, mês) — não da conta isolada —,
   então a mesma quantidade se repete nas contas daquele grupo. Uma linha do
   441.01 do centro 007 em março tem 21 contas: as 21 guardam o mesmo número.

   O QUE SEGURA A CONSISTÊNCIA
   O portal, não o banco. A tela edita UMA quantidade por (filial, centro,
   grupo, mês) e a grava em todas as contas daquele grupo de uma vez. O banco
   aceitaria valores diferentes; o caminho de escrita não os produz.

   Consequência para quem consultar direto: `SUM` nesta coluna multiplica pelo
   número de contas. Use MAX ou AVG — ou agrupe por grupo de conta antes.

   ANULÁVEL E SEM DEFAULT
   NULL distingue "ninguém informou" de "zero funcionários", e a alteração entra
   como metadado, sem reescrever a tabela.

   Rodar uma vez, no banco em uso. Idempotente.
   =========================================================================== */

IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANEJADO', 'QTDE_FUNCIONARIO') IS NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANEJADO
    ADD QTDE_FUNCIONARIO INT NULL;

  PRINT 'Coluna QTDE_FUNCIONARIO criada em KING_PORTAL_ORC_PLANEJADO.';
END
ELSE
  PRINT 'QTDE_FUNCIONARIO ja existe — nada a fazer.';
GO

/* Conferência das duas pontas: portal e ERP. */
SELECT
  OBJECT_NAME(c.object_id)  AS tabela,
  c.name                    AS coluna,
  TYPE_NAME(c.user_type_id) AS tipo,
  c.is_nullable             AS aceita_nulo
FROM sys.columns AS c
WHERE (c.object_id = OBJECT_ID('dbo.KING_PORTAL_ORC_PLANEJADO') AND c.name = 'QTDE_FUNCIONARIO')
   OR (c.object_id = OBJECT_ID('dbo.CTB_CONTA_ORCAMENTO')       AND c.name = 'U_QTDE_FUNCIONARIO');
GO
