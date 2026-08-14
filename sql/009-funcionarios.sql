/* ===========================================================================
   KING_PORTAL_ORC_FUNCIONARIO — quantidade de funcionários por centro
   Depende de: 003-orcamento-dados.sql

   O módulo Despesas com pessoal é o único que não orça valor. O valor dessas
   contas continua em Despesas operacionais, onde sempre esteve e onde bate com
   o Scoreplan; aqui se informa só QUANTAS pessoas o centro tem no mês.

   POR QUE TABELA PRÓPRIA, E NÃO UMA COLUNA NO PLANEJADO
   Grão diferente. A linha do planejado é uma CONTA; a quantidade é do CENTRO.
   Guardá-la lá dentro custava duas coisas:

   - repetição: o mesmo 7 gravado em ~11 linhas, uma por conta do centro, com
     `SUM` virando lixo silencioso para quem consultasse direto;
   - buraco: medido em homologação, 22 das 384 combinações (filial, centro, mês)
     não têm nenhuma linha de planejado — um centro com 3 pessoas e nada orçado
     não teria onde ser gravado.

   Aqui são 5 colunas e 384 linhas por ano, uma por lugar e mês. Sem repetir,
   sem buraco.

   RELAÇÃO COM O ERP
   `U_QTDE_FUNCIONARIO` em CTB_CONTA_ORCAMENTO (007) continua sendo o destino: a
   sincronização copia a quantidade do centro para cada conta de pessoal dele.
   Lá a repetição é inevitável — a coluna é por conta. Quem consultar o ERP deve
   usar MAX ou AVG agrupando por filial, centro e período; SUM multiplica pelo
   número de contas.

   Rodar uma vez, no banco em uso. Idempotente.
   =========================================================================== */

IF OBJECT_ID('dbo.KING_PORTAL_ORC_FUNCIONARIO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_FUNCIONARIO (
    PLANO_ID      VARCHAR(40)  NOT NULL,
    COD_FILIAL    VARCHAR(10)  NOT NULL,
    CENTRO_CUSTO  VARCHAR(10)  NOT NULL,
    MES           TINYINT      NOT NULL,
    QUANTIDADE    INT          NOT NULL,
    ALTERADO_EM   DATETIME2(3) NOT NULL CONSTRAINT DF_ORC_FUNC_ALTERADO DEFAULT (SYSUTCDATETIME()),
    ALTERADO_POR  VARCHAR(50)  NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_FUNCIONARIO PRIMARY KEY CLUSTERED
      (PLANO_ID, COD_FILIAL, CENTRO_CUSTO, MES),
    CONSTRAINT FK_KING_PORTAL_ORC_FUNCIONARIO_PLANO
      FOREIGN KEY (PLANO_ID) REFERENCES dbo.KING_PORTAL_ORC_PLANO (ID) ON DELETE CASCADE,
    CONSTRAINT CK_KING_PORTAL_ORC_FUNCIONARIO_MES CHECK (MES BETWEEN 1 AND 12),
    -- Zero é uma afirmação legítima (centro sem ninguém no mês); negativo não é.
    -- Ausência de linha é o "ninguém informou" — por isso a coluna é NOT NULL.
    CONSTRAINT CK_KING_PORTAL_ORC_FUNCIONARIO_QTDE CHECK (QUANTIDADE >= 0)
  );

  -- A tela lê o plano inteiro de uma vez; a PK já cobre esse caminho.
  PRINT 'Tabela KING_PORTAL_ORC_FUNCIONARIO criada.';
END
ELSE
  PRINT 'KING_PORTAL_ORC_FUNCIONARIO ja existe — nada a fazer.';
GO

/* ---------------------------------------------------------------------------
   QTDE_FUNCIONARIO no planejado sai de cena.
   Criada pelo 008, quando a quantidade ainda parecia ser por grupo de conta.
   Nasceu no grão errado e nunca foi escrita — dropar agora evita que alguém a
   encontre depois e a tome pela fonte da verdade.
   --------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.KING_PORTAL_ORC_PLANEJADO', 'QTDE_FUNCIONARIO') IS NOT NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_PLANEJADO DROP COLUMN QTDE_FUNCIONARIO;
  PRINT 'Coluna QTDE_FUNCIONARIO removida de KING_PORTAL_ORC_PLANEJADO.';
END
ELSE
  PRINT 'QTDE_FUNCIONARIO ja nao existe no planejado — nada a fazer.';
GO

/* Conferência das duas pontas. */
SELECT 'portal' AS onde, COUNT(*) AS linhas FROM dbo.KING_PORTAL_ORC_FUNCIONARIO
UNION ALL
SELECT 'erp (coluna existe)', CASE WHEN COL_LENGTH('dbo.CTB_CONTA_ORCAMENTO', 'U_QTDE_FUNCIONARIO') IS NULL THEN 0 ELSE 1 END;
GO
