/* ===========================================================================
   U_QTDE_FUNCIONARIO em CTB_CONTA_ORCAMENTO

   Quantidade de funcionários do setor, para o módulo Despesas com pessoal.

   PREFIXO U_
   É a convenção do Linx para coluna de usuário — o banco já tem dezenas
   (U_TIPO_VENDA, U_KIT_MKT_QTDE, U_COLECAO…), todas anuláveis. Seguir o padrão
   é o que faz a coluna sobreviver a uma atualização do ERP.

   ANULÁVEL E SEM DEFAULT, de propósito:
   - NULL distingue "ninguém informou" de "zero funcionários". Num campo de
     headcount essa diferença importa: zero é uma afirmação, ausência não.
   - Coluna anulável sem default entra como alteração de metadado no SQL Server:
     não reescreve as 330 mil linhas da tabela nem segura lock demorado.

   NÃO AFETA O GATILHO
   `LXI_CTB_CONTA_ORCAMENTO` é FOR INSERT e acumula saldo por VALOR. Uma coluna
   nova não muda isso, e o INSERT do portal lista as colunas explicitamente —
   continua funcionando sem alteração.

   Rodar uma vez, no banco em uso. Idempotente.
   =========================================================================== */

IF COL_LENGTH('dbo.CTB_CONTA_ORCAMENTO', 'U_QTDE_FUNCIONARIO') IS NULL
BEGIN
  ALTER TABLE dbo.CTB_CONTA_ORCAMENTO
    ADD U_QTDE_FUNCIONARIO INT NULL;

  PRINT 'Coluna U_QTDE_FUNCIONARIO criada em CTB_CONTA_ORCAMENTO.';
END
ELSE
  PRINT 'U_QTDE_FUNCIONARIO ja existe — nada a fazer.';
GO

/* Conferência. */
SELECT
  c.name        AS coluna,
  TYPE_NAME(c.user_type_id) AS tipo,
  c.is_nullable AS aceita_nulo
FROM sys.columns AS c
WHERE c.object_id = OBJECT_ID('dbo.CTB_CONTA_ORCAMENTO')
  AND c.name = 'U_QTDE_FUNCIONARIO';
GO
