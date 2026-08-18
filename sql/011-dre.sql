/* ===========================================================================
   DRE CONFIGURÁVEL — linhas do demonstrativo, por visão
   Depende de: 003-orcamento-dados.sql

   O DRE existiu antes com uma estrutura FIXA (um módulo inteiro = uma linha,
   sempre a mesma ordem) e foi removido de propósito: toda dúvida sobre "onde
   mora essa conta" virava dúvida sobre "não dobrar o subtotal do DRE".

   Aqui cada linha decide de onde vem:
     - ORIGEM = 'modulo': soma um recorte de contas de UM módulo do orçamento
       (KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA guarda quais — vazio = módulo
       inteiro, para quem não quer granularidade).
     - ORIGEM = 'formula': expressão que referencia OUTRAS LINHAS do mesmo
       demonstrativo (L[id]), avaliada por dados/dre.js — mesmo motor de
       dados/formula.js que Despesas com pessoal já usa para V[conta].

   BASE_ANALISE_VERTICAL e LINHA_PRINCIPAL são bandeiras — só uma linha por
   visão deveria ter cada uma marcada, mas isso não é imposto aqui (índice
   único exigiria filtro parcial condicionado ao valor 1, e SQL Server não
   tem "unique constraint só quando true" sem índice filtrado — mais
   complexidade do que vale; a tela evita marcar duas ao desmarcar a anterior
   antes de gravar a nova).

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA (
    VISAO_ID               VARCHAR(40)    NOT NULL,
    ID                      VARCHAR(40)    NOT NULL,
    ORDEM                   INT            NOT NULL,
    TITULO                  NVARCHAR(120)  NOT NULL,
    ORIGEM                  VARCHAR(10)    NOT NULL,        -- modulo | formula
    MODULO_ID               VARCHAR(40)    NULL,
    SINAL                   SMALLINT       NULL,             -- 1 | -1, só quando ORIGEM = modulo
    FORMULA                 NVARCHAR(500)  NULL,
    MOSTRA                  BIT            NOT NULL CONSTRAINT DF_ORC_DRE_L_MOSTRA  DEFAULT (1),
    DESTACA                 BIT            NOT NULL CONSTRAINT DF_ORC_DRE_L_DESTACA DEFAULT (0),
    BASE_ANALISE_VERTICAL   BIT            NOT NULL CONSTRAINT DF_ORC_DRE_L_BASE    DEFAULT (0),
    LINHA_PRINCIPAL         BIT            NOT NULL CONSTRAINT DF_ORC_DRE_L_PRINC   DEFAULT (0),
    ATUALIZADO_EM           DATETIME2(3)   NOT NULL CONSTRAINT DF_ORC_DRE_L_ATUAL   DEFAULT (SYSUTCDATETIME()),
    ATUALIZADO_POR          VARCHAR(50)    NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_DRE_LINHA PRIMARY KEY CLUSTERED (VISAO_ID, ID),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_DRE_LINHA_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID) ON DELETE CASCADE,
    CONSTRAINT CK_KING_PORTAL_ORC_VISAO_DRE_LINHA_ORIGEM
      CHECK (ORIGEM IN ('modulo', 'formula')),
    CONSTRAINT CK_KING_PORTAL_ORC_VISAO_DRE_LINHA_SINAL
      CHECK (SINAL IN (1, -1) OR SINAL IS NULL)
  );

  -- A tela lê a visão inteira ordenada; o índice acompanha esse caminho.
  CREATE INDEX IX_KING_PORTAL_ORC_VISAO_DRE_LINHA_ORDEM
    ON dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA (VISAO_ID, ORDEM);

  PRINT 'Tabela KING_PORTAL_ORC_VISAO_DRE_LINHA criada.';
END
ELSE
  PRINT 'KING_PORTAL_ORC_VISAO_DRE_LINHA ja existe — nada a fazer.';
GO

IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA (
    VISAO_ID       VARCHAR(40)  NOT NULL,
    LINHA_ID        VARCHAR(40)  NOT NULL,
    CLASSIFICACAO   VARCHAR(30)  NOT NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA
      PRIMARY KEY CLUSTERED (VISAO_ID, LINHA_ID, CLASSIFICACAO),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA_LINHA
      FOREIGN KEY (VISAO_ID, LINHA_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA (VISAO_ID, ID)
      ON DELETE CASCADE
  );

  PRINT 'Tabela KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA criada.';
END
ELSE
  PRINT 'KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA ja existe — nada a fazer.';
GO
