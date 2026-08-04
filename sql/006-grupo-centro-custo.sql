/* ===========================================================================
   GRUPOS DE CENTRO DE CUSTO
   Depende de: 003-orcamento-dados.sql

   Um grupo junta centros de custo e as contas que interessam para lê-los —
   "Fábrica", "Lojas", "Administrativo" — para o DRE poder ser visto por esse
   recorte em vez de centro a centro.

   É configuração GLOBAL, como as filiais em uso: vale para todos os planos.
   Não é visão. A visão diz quais contas cada módulo orça; o grupo é uma lente
   de leitura por cima do que já foi orçado.

   Um centro pode estar em vários grupos: "020 E-COMMERCE" cabe em "Digital" e
   em "Comercial" ao mesmo tempo, e forçar exclusividade obrigaria a escolher
   uma hierarquia só.

   Rodar uma vez, no banco em uso. Idempotente.
   =========================================================================== */

IF OBJECT_ID('dbo.KING_PORTAL_ORC_GRUPO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_GRUPO (
    ID              VARCHAR(40)   NOT NULL,
    NOME            VARCHAR(80)   NOT NULL,
    /* A classificação só significa algo DENTRO de uma visão contábil — o Linx
       tem 19. Sem guardar qual, as contas do grupo ficam ambíguas no dia em que
       alguém montar um plano sobre outra visão. */
    VISAO_CONTABIL  VARCHAR(10)   NOT NULL,
    CRIADO_EM       DATETIME2(3)  NOT NULL CONSTRAINT DF_ORC_GRUPO_CRIADO DEFAULT (SYSUTCDATETIME()),
    CRIADO_POR      VARCHAR(50)   NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_GRUPO PRIMARY KEY CLUSTERED (ID)
  );
END
GO

/* Centros do grupo. ON DELETE CASCADE: apagar o grupo leva os vínculos, que não
   significam nada sozinhos. */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_GRUPO_CENTRO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_GRUPO_CENTRO (
    GRUPO_ID      VARCHAR(40)  NOT NULL,
    CENTRO_CUSTO  VARCHAR(15)  NOT NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_GRUPO_CENTRO PRIMARY KEY CLUSTERED (GRUPO_ID, CENTRO_CUSTO),
    CONSTRAINT FK_KING_PORTAL_ORC_GRUPO_CENTRO
      FOREIGN KEY (GRUPO_ID) REFERENCES dbo.KING_PORTAL_ORC_GRUPO (ID) ON DELETE CASCADE
  );
END
GO

/* Contas do grupo, na visão contábil dele. */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_GRUPO_CONTA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_GRUPO_CONTA (
    GRUPO_ID       VARCHAR(40)  NOT NULL,
    CLASSIFICACAO  VARCHAR(20)  NOT NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_GRUPO_CONTA PRIMARY KEY CLUSTERED (GRUPO_ID, CLASSIFICACAO),
    CONSTRAINT FK_KING_PORTAL_ORC_GRUPO_CONTA
      FOREIGN KEY (GRUPO_ID) REFERENCES dbo.KING_PORTAL_ORC_GRUPO (ID) ON DELETE CASCADE
  );
END
GO

PRINT 'Grupos de centro de custo criados/verificados.';
GO
