/* ===========================================================================
   GRUPOS DE CENTRO DE CUSTO
   Depende de: 003-orcamento-dados.sql

   Um grupo junta centros de custo — "Fábrica", "Lojas", "Administrativo" —
   para o DRE poder ser visto por esse recorte em vez de centro a centro.

   É configuração GLOBAL, como as filiais em uso: vale para todos os planos.
   Não é visão, e não guarda contas: a visão do plano já diz quais contas cada
   módulo orça, e uma segunda lista aqui só teria como serventia discordar da
   primeira. O grupo diz POR ONDE ler, não O QUE ler.

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
    CRIADO_EM       DATETIME2(3)  NOT NULL CONSTRAINT DF_ORC_GRUPO_CRIADO DEFAULT (SYSUTCDATETIME()),
    CRIADO_POR      VARCHAR(50)   NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_GRUPO PRIMARY KEY CLUSTERED (ID)
  );
END
GO

/* O grupo NÃO guarda visão contábil.
   Uma versão anterior deste script criava a coluna VISAO_CONTABIL, com o
   argumento de que uma classificação só significa algo dentro de uma visão
   contábil. É verdade, mas a visão certa não é uma escolha do grupo: o DRE é
   lido DENTRO de um plano, e ali quem manda é a visão contábil da visão daquele
   plano. Guardar outra no grupo só criaria a chance de as duas discordarem.
   Removida aqui para quem já rodou a versão antiga. */
IF COL_LENGTH('dbo.KING_PORTAL_ORC_GRUPO', 'VISAO_CONTABIL') IS NOT NULL
BEGIN
  ALTER TABLE dbo.KING_PORTAL_ORC_GRUPO DROP COLUMN VISAO_CONTABIL;
  PRINT 'Coluna VISAO_CONTABIL removida do grupo.';
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

/* O grupo NÃO guarda contas.
   Uma versão anterior deste script criava KING_PORTAL_ORC_GRUPO_CONTA. A visão
   do plano já define quais contas cada módulo orça; repetir a escolha aqui só
   criava uma segunda lista para discordar da primeira na hora de ler o DRE.
   Removida aqui para quem já rodou a versão antiga. */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_GRUPO_CONTA', 'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.KING_PORTAL_ORC_GRUPO_CONTA;
  PRINT 'Tabela KING_PORTAL_ORC_GRUPO_CONTA removida.';
END
GO

PRINT 'Grupos de centro de custo criados/verificados.';
GO
