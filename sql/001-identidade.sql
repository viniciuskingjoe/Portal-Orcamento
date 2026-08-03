/* ===========================================================================
   IDENTIDADE COMPARTILHADA ENTRE OS PORTAIS AKR
   Banco: KINGEJOE

   Um cadastro de pessoas para todos os portais, em vez de uma tabela de login
   por projeto. Hoje existem quatro formatos diferentes (MenuBI, Portal-Envio-
   Documentos, PortalModelagem, Portal-Saldo) e nenhum lugar responde "quem tem
   acesso a quê".

   NADA AQUI APAGA OU ALTERA TABELA EXISTENTE. As tabelas dos portais que já
   rodam continuam intactas; a migração de cada um é um passo separado e
   posterior, feito por INSERT ... SELECT.

   O que é compartilhado: quem é a pessoa, se está ativa, em quais portais entra.
   O que NÃO é: o que ela pode fazer dentro de cada portal — isso continua na
   tabela de cada aplicação, porque as regras são realmente diferentes
   (relatório visível, papel fiscal, centro de custo).

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   PESSOAS

   `SENHA_HASH` é NULL quando o portal autentica por bind no AD — que é o caso
   do Orçamento. A coluna existe para os portais que ainda guardam senha própria
   poderem entrar neste cadastro sem mudança de schema, e sair dela quando
   migrarem para o AD. NUNCA guarda senha em texto: bcrypt.

   `LOGIN` é o sAMAccountName em minúsculo — é a chave que casa com o AD e com
   as tabelas dos outros portais.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_IDENTIDADE_USUARIO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_IDENTIDADE_USUARIO (
    LOGIN          VARCHAR(50)   NOT NULL,
    NOME           VARCHAR(120)  NOT NULL,
    EMAIL          VARCHAR(150)  NULL,
    SENHA_HASH     VARCHAR(200)  NULL,
    TROCAR_SENHA   BIT           NOT NULL CONSTRAINT DF_IDENT_USUARIO_TROCAR DEFAULT (0),
    SITUACAO       VARCHAR(20)   NOT NULL CONSTRAINT DF_IDENT_USUARIO_SIT    DEFAULT ('ativo'),
    ORIGEM         VARCHAR(20)   NOT NULL CONSTRAINT DF_IDENT_USUARIO_ORIGEM DEFAULT ('ad'),
    CRIADO_EM      DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_USUARIO_CRIADO DEFAULT (SYSUTCDATETIME()),
    ATUALIZADO_EM  DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_USUARIO_ATUAL  DEFAULT (SYSUTCDATETIME()),
    ULTIMO_LOGIN   DATETIME2(3)  NULL,

    CONSTRAINT PK_KING_IDENTIDADE_USUARIO PRIMARY KEY CLUSTERED (LOGIN),
    CONSTRAINT CK_KING_IDENTIDADE_USUARIO_SITUACAO
      CHECK (SITUACAO IN ('pendente', 'ativo', 'inativo')),
    CONSTRAINT CK_KING_IDENTIDADE_USUARIO_ORIGEM
      CHECK (ORIGEM IN ('ad', 'manual'))
  );
END
GO

/* ---------------------------------------------------------------------------
   PORTAIS

   Uma linha por aplicação. Serve para o acesso ser explícito: estar cadastrado
   não dá acesso a nada até existir a linha em KING_IDENTIDADE_ACESSO.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_IDENTIDADE_APP', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_IDENTIDADE_APP (
    APP        VARCHAR(30)   NOT NULL,
    NOME       VARCHAR(80)   NOT NULL,
    ATIVO      BIT           NOT NULL CONSTRAINT DF_IDENT_APP_ATIVO DEFAULT (1),
    CRIADO_EM  DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_APP_CRIADO DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_KING_IDENTIDADE_APP PRIMARY KEY CLUSTERED (APP)
  );
END
GO

MERGE dbo.KING_IDENTIDADE_APP AS destino
USING (VALUES
  ('orcamento', 'Planejamento Orçamentário'),
  ('modelagem', 'Portal Modelagem'),
  ('entradas',  'Fluxo Fiscal — Envio de Documentos'),
  ('saldo',     'Portal Saldo'),
  ('menubi',    'Menu BI')
) AS origem (APP, NOME)
ON destino.APP = origem.APP
WHEN NOT MATCHED THEN INSERT (APP, NOME) VALUES (origem.APP, origem.NOME);
GO

/* ---------------------------------------------------------------------------
   QUEM ENTRA EM QUAL PORTAL

   `ADMIN` é por portal, não global: administrar o Orçamento não deve dar poder
   sobre o Fluxo Fiscal.

   `SITUACAO` aqui é independente da do usuário — dá para tirar alguém de um
   portal sem desativar a pessoa nos outros.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_IDENTIDADE_ACESSO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_IDENTIDADE_ACESSO (
    LOGIN      VARCHAR(50)   NOT NULL,
    APP        VARCHAR(30)   NOT NULL,
    ADMIN      BIT           NOT NULL CONSTRAINT DF_IDENT_ACESSO_ADMIN DEFAULT (0),
    SITUACAO   VARCHAR(20)   NOT NULL CONSTRAINT DF_IDENT_ACESSO_SIT   DEFAULT ('ativo'),
    CRIADO_EM  DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_ACESSO_CRIADO DEFAULT (SYSUTCDATETIME()),
    CRIADO_POR VARCHAR(50)   NULL,

    CONSTRAINT PK_KING_IDENTIDADE_ACESSO PRIMARY KEY CLUSTERED (LOGIN, APP),
    CONSTRAINT FK_KING_IDENTIDADE_ACESSO_USUARIO
      FOREIGN KEY (LOGIN) REFERENCES dbo.KING_IDENTIDADE_USUARIO (LOGIN) ON DELETE CASCADE,
    CONSTRAINT FK_KING_IDENTIDADE_ACESSO_APP
      FOREIGN KEY (APP) REFERENCES dbo.KING_IDENTIDADE_APP (APP),
    CONSTRAINT CK_KING_IDENTIDADE_ACESSO_SITUACAO
      CHECK (SITUACAO IN ('ativo', 'inativo'))
  );

  CREATE INDEX IX_KING_IDENTIDADE_ACESSO_APP
    ON dbo.KING_IDENTIDADE_ACESSO (APP, SITUACAO) INCLUDE (LOGIN, ADMIN);
END
GO

/* ---------------------------------------------------------------------------
   SESSÕES

   Guarda o HASH do identificador de sessão, não ele mesmo. Quem lê esta tabela
   (backup, dump, consulta de suporte) não consegue se passar por ninguém: o
   valor que o navegador manda no cookie nunca fica gravado.

   Sessão em tabela, e não JWT, porque precisa ser revogável na hora — desligou
   no AD, tirou o acesso, encerrou tudo.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_IDENTIDADE_SESSAO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_IDENTIDADE_SESSAO (
    SID_HASH    CHAR(64)      NOT NULL,          -- SHA-256 do id em hex
    LOGIN       VARCHAR(50)   NOT NULL,
    APP         VARCHAR(30)   NOT NULL,
    CRIADA_EM   DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_SESSAO_CRIADA DEFAULT (SYSUTCDATETIME()),
    VISTA_EM    DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_SESSAO_VISTA  DEFAULT (SYSUTCDATETIME()),
    EXPIRA_EM   DATETIME2(3)  NOT NULL,
    IP          VARCHAR(45)   NULL,              -- cabe IPv6
    USER_AGENT  VARCHAR(300)  NULL,

    CONSTRAINT PK_KING_IDENTIDADE_SESSAO PRIMARY KEY CLUSTERED (SID_HASH),
    CONSTRAINT FK_KING_IDENTIDADE_SESSAO_USUARIO
      FOREIGN KEY (LOGIN) REFERENCES dbo.KING_IDENTIDADE_USUARIO (LOGIN) ON DELETE CASCADE
  );

  -- Para a limpeza periódica das expiradas.
  CREATE INDEX IX_KING_IDENTIDADE_SESSAO_EXPIRA
    ON dbo.KING_IDENTIDADE_SESSAO (EXPIRA_EM);
END
GO

/* ---------------------------------------------------------------------------
   AUDITORIA DE ACESSO

   Login, logout, negado, mudança de permissão. Com permissão vem a pergunta
   "quem liberou isso e quando", e ela não tem resposta se não for gravada na
   hora.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_IDENTIDADE_AUDITORIA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_IDENTIDADE_AUDITORIA (
    ID         BIGINT        IDENTITY(1,1) NOT NULL,
    QUANDO     DATETIME2(3)  NOT NULL CONSTRAINT DF_IDENT_AUD_QUANDO DEFAULT (SYSUTCDATETIME()),
    LOGIN      VARCHAR(50)   NULL,               -- NULL: tentativa com login inexistente
    APP        VARCHAR(30)   NULL,
    EVENTO     VARCHAR(40)   NOT NULL,           -- login | logout | negado | acesso-alterado
    DETALHE    VARCHAR(400)  NULL,
    IP         VARCHAR(45)   NULL,

    CONSTRAINT PK_KING_IDENTIDADE_AUDITORIA PRIMARY KEY CLUSTERED (ID)
  );

  CREATE INDEX IX_KING_IDENTIDADE_AUDITORIA_LOGIN
    ON dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, QUANDO DESC);
END
GO

PRINT 'Identidade compartilhada criada/verificada com sucesso.';
GO
