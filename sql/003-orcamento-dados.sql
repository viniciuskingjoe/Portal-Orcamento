/* ===========================================================================
   DADOS DO PLANEJAMENTO ORÇAMENTÁRIO
   Banco: KINGEJOE     Depende de: 001-identidade.sql

   O que hoje vive no localStorage do navegador: visões, planos e valores
   planejados. Filiais, centros de custo, plano de contas e realizado NÃO entram
   aqui — continuam vindo do ERP a cada carga.

   Sem estas tabelas o controle de permissão não tem o que proteger: qualquer
   um edita o localStorage e muda o próprio orçamento. É por isso que este
   script vem junto do de acesso.

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   CONFIGURAÇÃO GLOBAL (hoje: quais filiais o portal usa)
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_CONFIGURACAO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_CONFIGURACAO (
    CHAVE          VARCHAR(50)    NOT NULL,
    VALOR          NVARCHAR(MAX)  NULL,
    ATUALIZADO_EM  DATETIME2(3)   NOT NULL CONSTRAINT DF_ORC_CFG_ATUAL DEFAULT (SYSUTCDATETIME()),
    ATUALIZADO_POR VARCHAR(50)    NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_CONFIGURACAO PRIMARY KEY CLUSTERED (CHAVE)
  );
END
GO

/* ---------------------------------------------------------------------------
   VISÃO — aponta para UMA visão contábil do Linx e diz o que cada módulo orça
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO (
    ID              VARCHAR(40)   NOT NULL,
    NOME            VARCHAR(80)   NOT NULL,
    VISAO_CONTABIL  VARCHAR(10)   NULL,          -- CTB_VISAO_CONTABIL do ERP
    CRIADO_EM       DATETIME2(3)  NOT NULL CONSTRAINT DF_ORC_VISAO_CRIADO DEFAULT (SYSUTCDATETIME()),
    CRIADO_POR      VARCHAR(50)   NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO PRIMARY KEY CLUSTERED (ID)
  );
END
GO

IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_MODULO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_MODULO (
    VISAO_ID    VARCHAR(40)  NOT NULL,
    MODULO      VARCHAR(40)  NOT NULL,
    USA_CENTRO  BIT          NOT NULL CONSTRAINT DF_ORC_VM_CENTRO DEFAULT (0),

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_MODULO PRIMARY KEY CLUSTERED (VISAO_ID, MODULO),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_MODULO_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID) ON DELETE CASCADE
  );
END
GO

/* ---------------------------------------------------------------------------
   CENTROS EM USO POR FILIAL

   Existe porque "centro marcado e ainda sem conta" é estado legítimo: marcar o
   centro e escolher as contas dele são dois passos. Sem esta tabela, deduzir os
   centros a partir das contas apagaria a marcação de quem parou no meio.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_CENTRO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_CENTRO (
    VISAO_ID      VARCHAR(40)  NOT NULL,
    MODULO        VARCHAR(40)  NOT NULL,
    COD_FILIAL    VARCHAR(10)  NOT NULL,
    CENTRO_CUSTO  VARCHAR(10)  NOT NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_CENTRO
      PRIMARY KEY CLUSTERED (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_CENTRO_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID) ON DELETE CASCADE
  );
END
GO

/* ---------------------------------------------------------------------------
   CONTAS DA VISÃO

   `CENTRO_CUSTO` vazio ('') quando o módulo não usa centro — mesma convenção do
   front, onde SEM_CENTRO é string vazia. Vazio em vez de NULL para a chave
   primária ficar simples e comparável.

   Nos módulos com centro estas linhas são POR CENTRO. A lista consolidada da
   filial é a união delas, calculada na leitura — não se grava duas vezes.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_CONTA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_CONTA (
    VISAO_ID       VARCHAR(40)  NOT NULL,
    MODULO         VARCHAR(40)  NOT NULL,
    COD_FILIAL     VARCHAR(10)  NOT NULL,
    CENTRO_CUSTO   VARCHAR(10)  NOT NULL CONSTRAINT DF_ORC_VC_CENTRO DEFAULT (''),
    CLASSIFICACAO  VARCHAR(30)  NOT NULL,        -- 3.1.1.01.001

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_CONTA
      PRIMARY KEY CLUSTERED (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_CONTA_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID) ON DELETE CASCADE
  );
END
GO

/* ---------------------------------------------------------------------------
   SINAL DEFINIDO À MÃO

   O sinal sai do LX_GRUPO_CONTABIL da conta. Esta tabela guarda só as exceções
   que alguém marcou na tela — conta cadastrada como despesa no ERP que na
   verdade é receita.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_SINAL', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_SINAL (
    VISAO_ID       VARCHAR(40)  NOT NULL,
    MODULO         VARCHAR(40)  NOT NULL,
    CLASSIFICACAO  VARCHAR(30)  NOT NULL,
    TIPO           VARCHAR(10)  NOT NULL,        -- receita | despesa

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_SINAL
      PRIMARY KEY CLUSTERED (VISAO_ID, MODULO, CLASSIFICACAO),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_SINAL_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID) ON DELETE CASCADE,
    CONSTRAINT CK_KING_PORTAL_ORC_VISAO_SINAL_TIPO
      CHECK (TIPO IN ('receita', 'despesa'))
  );
END
GO

/* ---------------------------------------------------------------------------
   PLANO — um ano, uma visão
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_PLANO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_PLANO (
    ID          VARCHAR(40)   NOT NULL,
    NOME        VARCHAR(80)   NOT NULL,
    ANO         SMALLINT      NOT NULL,
    VISAO_ID    VARCHAR(40)   NULL,
    CRIADO_EM   DATETIME2(3)  NOT NULL CONSTRAINT DF_ORC_PLANO_CRIADO DEFAULT (SYSUTCDATETIME()),
    CRIADO_POR  VARCHAR(50)   NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_PLANO PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_KING_PORTAL_ORC_PLANO_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID),
    CONSTRAINT CK_KING_PORTAL_ORC_PLANO_ANO CHECK (ANO BETWEEN 2000 AND 2100)
  );
END
GO

/* ---------------------------------------------------------------------------
   PLANEJADO — uma linha por célula digitada

   A chave é a mesma que o front já usa hoje
   (`modulo|filial|centro|conta|mes|receita`), então a migração é de camada, não
   de modelo.

   `RECEITA` só é preenchida nos módulos percentuais (Deduções, Custos
   variáveis), onde o valor digitado é a taxa sobre UMA conta de receita: 2% de
   devolução sobre coleção não é 2% sobre e-commerce. Vazio nos demais.

   VALOR é DECIMAL(18,6), não DECIMAL(18,2): a mesma coluna guarda reais nos
   módulos normais e PERCENTUAL nos módulos por taxa, e a taxa precisa de casas
   — 38,9595% arredondado para 38,96% vira meio milhar de reais numa base de
   133 milhões.

   ALTERADO_POR/EM existem desde o começo porque, com permissão, "quem mudou
   este número" vira pergunta — e é impossível responder depois se não foi
   gravado na hora.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_PLANEJADO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_PLANEJADO (
    PLANO_ID       VARCHAR(40)     NOT NULL,
    MODULO         VARCHAR(40)     NOT NULL,
    COD_FILIAL     VARCHAR(10)     NOT NULL,
    CENTRO_CUSTO   VARCHAR(10)     NOT NULL CONSTRAINT DF_ORC_PLJ_CENTRO  DEFAULT (''),
    CLASSIFICACAO  VARCHAR(30)     NOT NULL,
    RECEITA        VARCHAR(30)     NOT NULL CONSTRAINT DF_ORC_PLJ_RECEITA DEFAULT (''),
    MES            TINYINT         NOT NULL,
    VALOR          DECIMAL(18, 6)  NOT NULL,
    ALTERADO_EM    DATETIME2(3)    NOT NULL CONSTRAINT DF_ORC_PLJ_ALTERADO DEFAULT (SYSUTCDATETIME()),
    ALTERADO_POR   VARCHAR(50)     NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_PLANEJADO PRIMARY KEY CLUSTERED
      (PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES),
    CONSTRAINT FK_KING_PORTAL_ORC_PLANEJADO_PLANO
      FOREIGN KEY (PLANO_ID) REFERENCES dbo.KING_PORTAL_ORC_PLANO (ID) ON DELETE CASCADE,
    CONSTRAINT CK_KING_PORTAL_ORC_PLANEJADO_MES CHECK (MES BETWEEN 1 AND 12)
  );

  -- A tela lê por plano + módulo + filial; o índice acompanha esse caminho.
  CREATE INDEX IX_KING_PORTAL_ORC_PLANEJADO_TELA
    ON dbo.KING_PORTAL_ORC_PLANEJADO (PLANO_ID, MODULO, COD_FILIAL)
    INCLUDE (CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR);
END
GO

PRINT 'Dados do Orçamento criados/verificados com sucesso.';
GO
