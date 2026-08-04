import { query, transaction } from "./sqlserver.js";
import { linhasParaOrcamento } from "../src/dados/plano.js";

// ============================================================================
// PUBLICAÇÃO DO PLANEJADO NO ORÇAMENTO DO LINX
//
// Cada plano do portal ganha um orçamento próprio em dbo.CTB_ORCAMENTO, e o
// planejado é publicado em dbo.CTB_CONTA_ORCAMENTO — de onde o Power BI já lê.
//
// ESTA É A ÚNICA PARTE DO PORTAL QUE ESCREVE EM TABELA DO ERP. Em todo o resto a
// regra é `SELECT` e nada mais.
//
// O GATILHO, que é o motivo de quase tudo aqui
// -------------------------------------------
// CTB_CONTA_ORCAMENTO tem `LXI_CTB_CONTA_ORCAMENTO`, FOR INSERT, que ACUMULA em
// CTB_SALDO_ORCAMENTO:
//
//     UPDATE CTB_SALDO_ORCAMENTO SET VALOR_ORCADO = VALOR_ORCADO + VALOR
//
// ...mas só quando o orçamento está com LX_STATUS_ORCAMENTO = 2 (ATIVO). E não
// existe gatilho de DELETE: apagar as linhas NÃO desfaz o saldo. Republicar um
// plano num orçamento ATIVO somaria de novo, para sempre, sem forma de corrigir
// pelo portal.
//
// Por isso o orçamento nasce em COD_STATUS_ORCAMENTO = 1 (EM ELABORAÇÃO), onde o
// gatilho não faz nada, e a publicação CONFERE O STATUS DENTRO DA TRANSAÇÃO
// antes de inserir. Se alguém tiver ativado o orçamento pelo Linx, a publicação
// para — é melhor o portal recusar e alguém investigar do que inflar em silêncio
// um saldo contábil.
// ============================================================================

const STATUS_EM_ELABORACAO = 1;

// Valores que o Linx usa nas linhas que ele mesmo grava — conferidos nas 323 mil
// linhas existentes. Copiar o que já está lá é o que faz a nossa linha parecer
// com as outras para quem consultar depois.
const TIPO_MOVIMENTO = 1;
const TIPO_ITEM = 1;
const VERSAO_CONTABIL = 1;

// --------------------------------------------------------------------------
// O orçamento do plano
// --------------------------------------------------------------------------

// Cria o orçamento no ERP para um plano que ainda não tem. O id não é IDENTITY:
// quem escolhe é a aplicação, então pegamos o próximo livre.
export async function garantirOrcamento(planoId, login) {
  const plano = await umPlano(planoId);
  if (plano.ID_ORCAMENTO) return plano.ID_ORCAMENTO;

  // O exercício é do calendário contábil do Linx, não nosso: quem o cria é quem
  // administra o ERP. Sem esta checagem o erro seria uma violação de chave
  // estrangeira crua, que não diz o que fazer nem para quem pedir.
  const [exercicio] = await query(
    "SELECT ID_EXERCICIO FROM dbo.CTB_EXERCICIO WHERE ID_EXERCICIO = @ano AND ID_VERSAO_CONTABIL = @versao",
    { ano: plano.ANO, versao: VERSAO_CONTABIL }
  );

  if (!exercicio) {
    const erro = new Error(
      `O exercício ${plano.ANO} não existe no Linx. Ele precisa ser criado no ERP ` +
        `(calendário contábil) antes de o orçamento deste plano poder ser publicado.`
    );
    erro.status = 409;
    throw erro;
  }

  return transaction(async ({ query: q }) => {
    const [{ proximo }] = await q(
      "SELECT ISNULL(MAX(ID_ORCAMENTO), 0) + 1 AS proximo FROM dbo.CTB_ORCAMENTO"
    );

    await q(
      `INSERT INTO dbo.CTB_ORCAMENTO
         (ID_ORCAMENTO, DESC_ORCAMENTO, COD_MATRIZ_CONTABIL, VISAO_CONTABIL,
          ID_VERSAO_CONTABIL, ID_EXERCICIO, INATIVO, COD_STATUS_ORCAMENTO)
       VALUES (@id, @desc, @matriz, @visao, @versao, @ano, 0, @status)`,
      {
        id: proximo,
        desc: `${plano.NOME} (PORTAL)`.slice(0, 40),
        matriz: plano.COD_MATRIZ ?? "000001",
        visao: plano.VISAO_CONTABIL ?? "25",
        versao: VERSAO_CONTABIL,
        ano: plano.ANO,
        status: STATUS_EM_ELABORACAO,
      }
    );

    await q("UPDATE dbo.KING_PORTAL_ORC_PLANO SET ID_ORCAMENTO = @id WHERE ID = @plano", {
      id: proximo,
      plano: planoId,
    });

    await registrar(q, planoId, login, `orçamento ${proximo} criado no ERP`);
    return proximo;
  });
}

async function umPlano(planoId) {
  const [plano] = await query(
    `SELECT p.ID, p.NOME, p.ANO, p.ID_ORCAMENTO, v.VISAO_CONTABIL
       FROM dbo.KING_PORTAL_ORC_PLANO AS p
       LEFT JOIN dbo.KING_PORTAL_ORC_VISAO AS v ON v.ID = p.VISAO_ID
      WHERE p.ID = @id`,
    { id: planoId }
  );

  if (!plano) {
    const erro = new Error("Plano não encontrado.");
    erro.status = 404;
    throw erro;
  }
  return plano;
}

function registrar(q, planoId, login, detalhe) {
  return q(
    `INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE)
     VALUES (@login, 'orcamento', 'publicado-no-linx', @detalhe)`,
    { login: login ?? null, detalhe: `${planoId}: ${detalhe}`.slice(0, 400) }
  ).catch(() => {}); // auditoria não pode derrubar a publicação
}

// --------------------------------------------------------------------------
// Publicar
// --------------------------------------------------------------------------

export async function publicar(planoId, estado, login) {
  const plano = (estado?.planos ?? []).find((item) => item.id === planoId);
  const visao = (estado?.visoes ?? []).find((item) => item.id === plano?.visaoId);

  if (!plano) {
    const erro = new Error("Plano não encontrado.");
    erro.status = 404;
    throw erro;
  }
  if (!visao) {
    const erro = new Error("Este plano não tem visão associada — não há o que publicar.");
    erro.status = 400;
    throw erro;
  }

  const idOrcamento = await garantirOrcamento(planoId, login);
  const linhas = linhasParaOrcamento({ plano, visao });

  return transaction(async ({ query: q }) => {
    // Dentro da transação, de propósito: entre ler o status e inserir, alguém
    // poderia ativar o orçamento pelo Linx e o gatilho passaria a somar no
    // saldo. Aqui a leitura e a escrita são o mesmo instante.
    const [orcamento] = await q(
      `SELECT o.COD_STATUS_ORCAMENTO, s.LX_STATUS_ORCAMENTO, o.ID_EXERCICIO
         FROM dbo.CTB_ORCAMENTO AS o
         JOIN dbo.CTB_STATUS_ORCAMENTO AS s
           ON s.COD_STATUS_ORCAMENTO = o.COD_STATUS_ORCAMENTO
        WHERE o.ID_ORCAMENTO = @id`,
      { id: idOrcamento }
    );

    if (!orcamento) {
      const erro = new Error(`O orçamento ${idOrcamento} não existe mais no ERP.`);
      erro.status = 409;
      throw erro;
    }

    if (orcamento.LX_STATUS_ORCAMENTO === 2) {
      const erro = new Error(
        `O orçamento ${idOrcamento} está ATIVO no Linx. Publicar nele somaria no ` +
          `saldo orçado sem forma de desfazer. Volte para EM ELABORAÇÃO antes.`
      );
      erro.status = 409;
      throw erro;
    }

    // Apagar é seguro: o gatilho é só de INSERT.
    await q("DELETE FROM dbo.CTB_CONTA_ORCAMENTO WHERE ID_ORCAMENTO = @id", { id: idOrcamento });

    let item = 0;
    for (const linha of linhas) {
      item += 1;
      await q(
        `INSERT INTO dbo.CTB_CONTA_ORCAMENTO
           (ID_ORCAMENTO, ITEM_ORCAMENTO, ID_VERSAO_CONTABIL, ID_EXERCICIO, ID_PERIODO,
            DATA_LANCAMENTO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, VALOR,
            DEBITO_MOEDA, CREDITO_MOEDA, TIPO_MOVIMENTO, TIPO_ITEM_ORCAMENTO,
            CTRL_BLOQUEIO, BLOQUEIO_POR_EXERCICIO, USUARIO, DATA_INCLUSAO)
         VALUES
           (@orcamento, @item, @versao, @ano, @mes,
            @data, @filial, @centro, @conta, @valor,
            0, 0, @tipoMov, @tipoItem,
            0, 0, @usuario, SYSDATETIME())`,
        {
          orcamento: idOrcamento,
          item,
          versao: VERSAO_CONTABIL,
          ano: plano.ano,
          mes: linha.mes,
          // Primeiro dia do mês, como o Linx grava. `Date` vai como DateTime2(3)
          // pelo binder — a hora fica zerada, que é o que a coluna espera.
          data: new Date(Date.UTC(plano.ano, linha.mes - 1, 1)),
          filial: linha.filial,
          centro: linha.centro,
          conta: linha.conta,
          valor: linha.valor,
          tipoMov: TIPO_MOVIMENTO,
          tipoItem: TIPO_ITEM,
          usuario: (login ?? "portal").slice(0, 25),
        }
      );
    }

    await q(
      `UPDATE dbo.KING_PORTAL_ORC_PLANO
          SET PUBLICADO_EM = SYSUTCDATETIME(), PUBLICADO_POR = @login, PUBLICADO_LINHAS = @linhas
        WHERE ID = @plano`,
      { plano: planoId, login: login ?? null, linhas: linhas.length }
    );

    await registrar(q, planoId, login, `${linhas.length} linhas no orçamento ${idOrcamento}`);

    return { idOrcamento, linhas: linhas.length };
  });
}
