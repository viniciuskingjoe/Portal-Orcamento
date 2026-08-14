import { query, transaction } from "./sqlserver.js";
import { linhasParaOrcamento } from "../src/dados/plano.js";
import { modulo } from "../src/dados/modulos.js";

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
// Quantidade de funcionários
//
// Os grupos de conta que descrevem folha. A quantidade é do CENTRO, mas
// `U_QTDE_FUNCIONARIO` é coluna de CTB_CONTA_ORCAMENTO, então ela sai daqui
// repetida em todas as contas de pessoal daquele centro no mês.
//
// A repetição é do formato do ERP, não uma escolha: não há tabela por centro do
// lado de lá. Quem consultar deve usar MAX ou AVG agrupando por filial, centro e
// período — SUM multiplica pelo número de contas.
// --------------------------------------------------------------------------

// Os mesmos prefixos que recortam a árvore do módulo na visão. Uma lista só:
// duas cópias divergiriam no dia em que uma família de folha fosse criada, e a
// divergência apareceria como quantidade faltando numas contas e não noutras.
const GRUPOS_DE_PESSOAL = modulo("despesas-pessoal")?.prefixos ?? [];

const filtroDePessoal = GRUPOS_DE_PESSOAL.map(
  (_, i) => `RTRIM(CLASSIFICACAO) LIKE @grupo${i} + '%'`
).join(" OR ");

const parametrosDePessoal = Object.fromEntries(
  GRUPOS_DE_PESSOAL.map((prefixo, i) => [`grupo${i}`, prefixo])
);

// A coluna vem do sql/007, que pode não ter sido rodado neste banco. Sem a
// checagem, publicar num banco em que ela falta derrubaria a transação inteira e
// levaria junto o valor, que não tem nada a ver com isso.
let temColunaQtde = null;

async function colunaDeQuantidadeExiste(q) {
  if (temColunaQtde === null) {
    const [linha] = await q(
      "SELECT COL_LENGTH('dbo.CTB_CONTA_ORCAMENTO', 'U_QTDE_FUNCIONARIO') AS tem"
    );
    temColunaQtde = linha?.tem != null;
  }
  return temColunaQtde;
}

// Espelha a quantidade do portal nas linhas do orçamento.
//
// Limpa antes de gravar, e a limpeza é do orçamento inteiro: assim um centro que
// deixou de informar, ou uma conta que saiu do módulo, não fica com um número
// velho grudado. É a mesma autocorreção do valor — o que vale é o portal AGORA,
// não o que ele lembra de ter enviado.
async function espelharQuantidades(q, idOrcamento, plano) {
  if (!(await colunaDeQuantidadeExiste(q))) return { celulas: 0, linhas: 0, ignorado: true };

  await q(
    `UPDATE dbo.CTB_CONTA_ORCAMENTO
        SET U_QTDE_FUNCIONARIO = NULL
      WHERE ID_ORCAMENTO = @id AND U_QTDE_FUNCIONARIO IS NOT NULL`,
    { id: idOrcamento }
  );

  let celulas = 0;
  let linhas = 0;
  for (const [chave, quantidade] of Object.entries(plano.funcionarios ?? {})) {
    if (!Number.isInteger(quantidade)) continue;
    const [filial, centro, mes] = chave.split("|");

    const afetadas = await q(
      `UPDATE dbo.CTB_CONTA_ORCAMENTO
          SET U_QTDE_FUNCIONARIO = @quantidade
        WHERE ID_ORCAMENTO = @id AND COD_FILIAL = @filial
          AND CENTRO_CUSTO = @centro AND ID_PERIODO = @mes
          AND (${filtroDePessoal});
       SELECT @@ROWCOUNT AS linhas;`,
      { id: idOrcamento, filial, centro, mes: Number(mes), quantidade, ...parametrosDePessoal }
    );

    celulas += 1;
    linhas += Number(afetadas?.[0]?.linhas ?? 0);
  }

  return { celulas, linhas, ignorado: false };
}

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

    // Compara com o que já está lá e aplica só a diferença.
    //
    // Antes eram DELETE de tudo + um INSERT por linha: 7.121 idas ao servidor,
    // ~57s de transação aberta segurando lock numa tabela do ERP. E, durante
    // esse minuto, quem lesse o orçamento fora da transação o via VAZIO.
    //
    // A comparação é contra o que o ERP tem AGORA, não contra o que o portal
    // lembra de ter enviado — então continua se autocorrigindo: linha apagada à
    // mão no Linx volta, valor mexido por fora é reposto. Num ajuste normal, de
    // algumas células, são dezenas de comandos em vez de milhares.
    const atuais = await q(
      `SELECT ITEM_ORCAMENTO, RTRIM(COD_FILIAL) AS COD_FILIAL,
              RTRIM(CENTRO_CUSTO) AS CENTRO_CUSTO, RTRIM(CLASSIFICACAO) AS CLASSIFICACAO,
              ID_PERIODO, VALOR
         FROM dbo.CTB_CONTA_ORCAMENTO
        WHERE ID_ORCAMENTO = @id`,
      { id: idOrcamento }
    );

    const chaveDa = (filial, centro, conta, mes) => `${filial}|${centro}|${conta}|${mes}`;

    // Duplicata só aparece se alguém inseriu à mão: `linhasParaOrcamento` produz
    // uma linha por combinação. A primeira serve de par; as demais são sobra.
    const noErp = new Map();
    const sobrando = [];
    let maiorItem = 0;
    for (const linha of atuais) {
      maiorItem = Math.max(maiorItem, Number(linha.ITEM_ORCAMENTO) || 0);
      const chave = chaveDa(
        linha.COD_FILIAL,
        linha.CENTRO_CUSTO,
        linha.CLASSIFICACAO,
        Number(linha.ID_PERIODO)
      );
      if (noErp.has(chave)) sobrando.push(linha.ITEM_ORCAMENTO);
      else noErp.set(chave, { item: linha.ITEM_ORCAMENTO, valor: Number(linha.VALOR) });
    }

    const aInserir = [];
    const aAtualizar = [];
    for (const linha of linhas) {
      const chave = chaveDa(linha.filial, linha.centro, linha.conta, linha.mes);
      const atual = noErp.get(chave);
      if (!atual) {
        aInserir.push(linha);
        continue;
      }
      noErp.delete(chave);
      // Meio centavo de tolerância: a coluna do ERP tem duas casas, e comparar
      // decimais por igualdade exata reescreveria linhas idênticas.
      if (Math.abs(atual.valor - linha.valor) > 0.005) {
        aAtualizar.push({ item: atual.item, valor: linha.valor });
      }
    }

    // O que sobrou no mapa não existe mais no plano.
    const aRemover = [...noErp.values()].map((x) => x.item).concat(sobrando);

    if (aRemover.length) {
      // Em blocos: um IN com milhares de itens estoura o limite de parâmetros.
      for (let i = 0; i < aRemover.length; i += 500) {
        const bloco = aRemover.slice(i, i + 500);
        const nomes = bloco.map((_, j) => `@item${j}`).join(", ");
        const parametros = { id: idOrcamento };
        bloco.forEach((item, j) => {
          parametros[`item${j}`] = item;
        });
        await q(
          `DELETE FROM dbo.CTB_CONTA_ORCAMENTO
            WHERE ID_ORCAMENTO = @id AND ITEM_ORCAMENTO IN (${nomes})`,
          parametros
        );
      }
    }

    for (const alvo of aAtualizar) {
      await q(
        `UPDATE dbo.CTB_CONTA_ORCAMENTO
            SET VALOR = @valor, USUARIO = @usuario, DATA_INCLUSAO = SYSDATETIME()
          WHERE ID_ORCAMENTO = @id AND ITEM_ORCAMENTO = @item`,
        {
          id: idOrcamento,
          item: alvo.item,
          valor: alvo.valor,
          usuario: (login ?? "portal").slice(0, 25),
        }
      );
    }

    let item = maiorItem;
    for (const linha of aInserir) {
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

    // Depois das linhas de valor: uma conta que acabou de nascer também precisa
    // receber a quantidade do centro dela.
    const quantidades = await espelharQuantidades(q, idOrcamento, plano);

    await q(
      `UPDATE dbo.KING_PORTAL_ORC_PLANO
          SET PUBLICADO_EM = SYSUTCDATETIME(), PUBLICADO_POR = @login, PUBLICADO_LINHAS = @linhas
        WHERE ID = @plano`,
      { plano: planoId, login: login ?? null, linhas: linhas.length }
    );

    const resumo =
      `${linhas.length} linhas no orçamento ${idOrcamento} ` +
      `(${aInserir.length} novas, ${aAtualizar.length} alteradas, ${aRemover.length} removidas` +
      `${quantidades.ignorado ? "" : `, ${quantidades.celulas} quantidades`})`;
    await registrar(q, planoId, login, resumo);

    return {
      idOrcamento,
      linhas: linhas.length,
      inseridas: aInserir.length,
      atualizadas: aAtualizar.length,
      removidas: aRemover.length,
      // Quantas células de quantidade foram publicadas e em quantas linhas do
      // ERP elas caíram — os dois números diferem porque a coluna é por conta.
      quantidades: quantidades.celulas,
      linhasComQuantidade: quantidades.linhas,
    };
  });
}
