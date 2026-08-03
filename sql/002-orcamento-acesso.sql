/* ===========================================================================
   PERMISSÕES DO PLANEJAMENTO ORÇAMENTÁRIO
   Banco: KINGEJOE     Depende de: 001-identidade.sql

   Quem é a pessoa fica na identidade compartilhada. Aqui fica só o que ela pode
   ver e editar DENTRO deste portal — as dimensões que o sistema já tem:
   módulo × filial × centro de custo.

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   ACESSO

   Cada linha é uma concessão. NULL em qualquer dimensão significa TODOS dela:

     LOGIN         MODULO            COD_FILIAL  CENTRO_CUSTO  PODE_EDITAR
     ------------  ----------------  ----------  ------------  -----------
     ana.paula     NULL              NULL        NULL          1   tudo
     joao.silva    NULL              NULL        020           1   só o centro 020
     joao.silva    receita-vendas    NULL        NULL          0   vê a receita
     marcia        NULL              000025      NULL          1   só a filial MEN HUB
     diretoria     NULL              NULL        NULL          0   vê tudo, não lança

   A LINHA EXISTIR JÁ DÁ O DIREITO DE VER. `PODE_EDITAR` diz se também lança.
   As linhas somam: vale a mais permissiva.

   A segunda linha do exemplo é o que resolve um problema real do modelo:
   Deduções e Custos variáveis são percentual SOBRE A RECEITA PLANEJADA. Sem
   enxergar a receita, quem só tem um centro digita 1,70% e vê R$ 0,00, porque
   a base é invisível para ele. Dar leitura da receita conserta sem deixar
   ninguém planejar faturamento sem querer.

   `MODULO` guarda o id do módulo tal como em src/dados/modulos.js
   (receita-vendas, deducoes-vendas, custos-variaveis, despesas-variaveis,
   despesas-operacionais, outras-despesas, receitas-nao-operacionais,
   despesas-pessoal). Não é FK: os módulos são fixos no código, não em tabela.

   O UNIQUE trata NULL como valor, que é o comportamento do SQL Server e é o
   que se quer aqui: a mesma combinação não pode ser concedida duas vezes.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.KING_PORTAL_ORC_ACESSO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_ACESSO (
    ID            INT           IDENTITY(1,1) NOT NULL,
    LOGIN         VARCHAR(50)   NOT NULL,
    MODULO        VARCHAR(40)   NULL,
    COD_FILIAL    VARCHAR(10)   NULL,
    CENTRO_CUSTO  VARCHAR(10)   NULL,
    PODE_EDITAR   BIT           NOT NULL CONSTRAINT DF_ORC_ACESSO_EDITAR DEFAULT (0),
    CRIADO_EM     DATETIME2(3)  NOT NULL CONSTRAINT DF_ORC_ACESSO_CRIADO DEFAULT (SYSUTCDATETIME()),
    CRIADO_POR    VARCHAR(50)   NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_ACESSO PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_KING_PORTAL_ORC_ACESSO
      UNIQUE (LOGIN, MODULO, COD_FILIAL, CENTRO_CUSTO),
    CONSTRAINT FK_KING_PORTAL_ORC_ACESSO_USUARIO
      FOREIGN KEY (LOGIN) REFERENCES dbo.KING_IDENTIDADE_USUARIO (LOGIN) ON DELETE CASCADE
  );

  CREATE INDEX IX_KING_PORTAL_ORC_ACESSO_LOGIN
    ON dbo.KING_PORTAL_ORC_ACESSO (LOGIN);
END
GO

PRINT 'Permissões do Orçamento criadas/verificadas com sucesso.';
GO
