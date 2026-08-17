/* ===========================================================================
   KING_PORTAL_ORC_VISAO_FORMULA — conta fixa ou calculada, em Despesas com pessoal
   Depende de: 003-orcamento-dados.sql

   Toda conta é FIXA por padrão (ausência de linha = digita o valor, como
   sempre) — mesma convenção de KING_PORTAL_ORC_VISAO_SINAL, onde ausência é o
   comportamento automático. Só entra linha aqui quando a conta vira
   CALCULADA e ganha uma expressão.

   A expressão referencia outras contas do MESMO módulo por código, formato
   V[classificacao] (ex.: "(V[4.2.1.10.001] + V[4.2.1.10.002]) / 12"). Quem
   avalia é dados/formula.js, usado tanto na tela quanto na publicação para o
   Linx — os dois têm que dar o mesmo número.

   Sem vigência por data nesta versão: uma fórmula por conta, substituível a
   qualquer momento. Se um dia precisar de histórico por período, é coluna
   nova, não tabela nova — o layout já tem OBJECT_ID(...) IS NULL para reuso.

   Script idempotente: pode rodar mais de uma vez.
   =========================================================================== */

IF OBJECT_ID('dbo.KING_PORTAL_ORC_VISAO_FORMULA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.KING_PORTAL_ORC_VISAO_FORMULA (
    VISAO_ID       VARCHAR(40)    NOT NULL,
    MODULO         VARCHAR(40)    NOT NULL,
    CLASSIFICACAO  VARCHAR(30)    NOT NULL,
    EXPRESSAO      NVARCHAR(500)  NOT NULL,
    ATUALIZADO_EM  DATETIME2(3)   NOT NULL CONSTRAINT DF_ORC_VF_ATUAL DEFAULT (SYSUTCDATETIME()),
    ATUALIZADO_POR VARCHAR(50)    NULL,

    CONSTRAINT PK_KING_PORTAL_ORC_VISAO_FORMULA
      PRIMARY KEY CLUSTERED (VISAO_ID, MODULO, CLASSIFICACAO),
    CONSTRAINT FK_KING_PORTAL_ORC_VISAO_FORMULA_VISAO
      FOREIGN KEY (VISAO_ID) REFERENCES dbo.KING_PORTAL_ORC_VISAO (ID) ON DELETE CASCADE
  );

  PRINT 'Tabela KING_PORTAL_ORC_VISAO_FORMULA criada.';
END
ELSE
  PRINT 'KING_PORTAL_ORC_VISAO_FORMULA ja existe — nada a fazer.';
GO
