import { query, transaction } from "./sqlserver.js";
import { chavePlanejado } from "../src/dados/plano.js";

// ============================================================================
// DADOS DO PORTAL
//
// Visões, planos e planejado — o que era localStorage. Filiais, centros, plano
// de contas e realizado continuam vindo do ERP a cada carga e não passam por
// aqui.
//
// `chavePlanejado` vem do módulo do front de propósito: o formato da chave é
// contrato entre as duas pontas, e mantê-lo em dois lugares é garantir que um
// dia divirjam.
//
// AS ESCRITAS SÃO GRANULARES, uma por operação de domínio. Gravar o estado
// inteiro a cada tecla mandaria dezenas de milhares de linhas por clique — a
// visão de um módulo tem até 383 contas por filial.
// ============================================================================

const SEM_CENTRO = "";

// As colunas de publicação no Linx vêm do sql/004, que pode não ter sido rodado
// ainda — é o caso de um banco que ficou em 003. Selecioná-las sem conferir
// derrubaria `carregarEstado`, que é a leitura principal do portal: a tela
// inteira ficaria fora do ar por causa de um recurso que ninguém está usando.
//
// A resposta é guardada porque isto é esquema, não dado: consultar a cada carga
// custaria uma ida ao banco por uma resposta que não muda enquanto o processo
// vive. Reiniciar o serviço é o que faz o portal enxergar o 004 recém-rodado.
const colunasConhecidas = new Map();

async function temColuna(tabela, coluna) {
  const chave = tabela + "." + coluna;
  if (!colunasConhecidas.has(chave)) {
    const [linha] = await query("SELECT COL_LENGTH(@t, @c) AS tem", { t: tabela, c: coluna });
    colunasConhecidas.set(chave, linha?.tem != null);
  }
  return colunasConhecidas.get(chave);
}

const temPublicacao = () => temColuna("dbo.KING_PORTAL_ORC_PLANO", "PUBLICADO_EM");
const temSituacao = () => temColuna("dbo.KING_PORTAL_ORC_PLANO", "SITUACAO");

// --------------------------------------------------------------------------
// Leitura
// --------------------------------------------------------------------------

export async function carregarEstado() {
  const [config, visoes, modulos, centros, contas, sinais, planos, planejado] = await Promise.all([
    query("SELECT CHAVE, VALOR FROM dbo.KING_PORTAL_ORC_CONFIGURACAO"),
    query("SELECT ID, NOME, VISAO_CONTABIL FROM dbo.KING_PORTAL_ORC_VISAO ORDER BY NOME"),
    query("SELECT VISAO_ID, MODULO, USA_CENTRO FROM dbo.KING_PORTAL_ORC_VISAO_MODULO"),
    query("SELECT VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO"),
    query(
      `SELECT VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO
         FROM dbo.KING_PORTAL_ORC_VISAO_CONTA ORDER BY CLASSIFICACAO`
    ),
    query("SELECT VISAO_ID, MODULO, CLASSIFICACAO, TIPO FROM dbo.KING_PORTAL_ORC_VISAO_SINAL"),
    query(
      `SELECT ID, NOME, ANO, VISAO_ID${
        (await temPublicacao()) ? ", ID_ORCAMENTO, PUBLICADO_EM, PUBLICADO_LINHAS" : ""
      }${(await temSituacao()) ? ", SITUACAO" : ""}
         FROM dbo.KING_PORTAL_ORC_PLANO ORDER BY ANO DESC, NOME`
    ),
    query(
      `SELECT PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR
         FROM dbo.KING_PORTAL_ORC_PLANEJADO`
    ),
  ]);

  const porVisao = new Map(
    visoes.map((linha) => [
      linha.ID,
      { id: linha.ID, nome: linha.NOME, visaoContabil: linha.VISAO_CONTABIL, modulos: {} },
    ])
  );

  const moduloDe = (visaoId, moduloId) => {
    const visao = porVisao.get(visaoId);
    if (!visao) return null;
    visao.modulos[moduloId] ??= { sinais: {}, filiais: {} };
    return visao.modulos[moduloId];
  };
  const filialDe = (visaoId, moduloId, filialId) => {
    const modulo = moduloDe(visaoId, moduloId);
    if (!modulo) return null;
    modulo.filiais[filialId] ??= { contas: [], centros: {} };
    return modulo.filiais[filialId];
  };

  // A linha em _VISAO_MODULO passou a servir só para o módulo existir na visão:
  // todo módulo é orçado por centro, e USA_CENTRO ficou sem uso.
  modulos.forEach((linha) => moduloDe(linha.VISAO_ID, linha.MODULO));

  centros.forEach((linha) => {
    const filial = filialDe(linha.VISAO_ID, linha.MODULO, linha.COD_FILIAL);
    if (filial) filial.centros[linha.CENTRO_CUSTO] ??= [];
  });

  contas.forEach((linha) => {
    const filial = filialDe(linha.VISAO_ID, linha.MODULO, linha.COD_FILIAL);
    if (!filial) return;
    if (linha.CENTRO_CUSTO === SEM_CENTRO) filial.contas.push(linha.CLASSIFICACAO);
    else (filial.centros[linha.CENTRO_CUSTO] ??= []).push(linha.CLASSIFICACAO);
  });

  // A lista da filial é SEMPRE a união dos centros — mesma regra de
  // dados/visao.js. Derivar na leitura evita gravar a mesma informação duas
  // vezes e sair do ar quando as duas divergirem.
  porVisao.forEach((visao) => {
    Object.values(visao.modulos).forEach((modulo) => {
      Object.values(modulo.filiais).forEach((filial) => {
        filial.contas = [...new Set(Object.values(filial.centros).flat())].sort();
      });
    });
  });

  sinais.forEach((linha) => {
    const modulo = moduloDe(linha.VISAO_ID, linha.MODULO);
    if (modulo) modulo.sinais[linha.CLASSIFICACAO] = linha.TIPO;
  });

  const porPlano = new Map(
    planos.map((linha) => [
      linha.ID,
      {
        id: linha.ID,
        nome: linha.NOME,
        ano: linha.ANO,
        visaoId: linha.VISAO_ID,
        // `undefined` num banco sem o sql/004 — a tela trata como "nunca
        // publicado", que é a verdade nesse caso.
        idOrcamento: linha.ID_ORCAMENTO ?? null,
        publicadoEm: linha.PUBLICADO_EM ?? null,
        publicadoLinhas: linha.PUBLICADO_LINHAS ?? null,
        // Sem a coluna (banco no 004 ou antes), todo plano e ativo -- que e o
        // que ele era antes de existir situacao.
        situacao: linha.SITUACAO ?? "ativo",
        planejado: {},
      },
    ])
  );

  planejado.forEach((linha) => {
    const plano = porPlano.get(linha.PLANO_ID);
    if (!plano) return;
    const chave = chavePlanejado(
      linha.MODULO,
      linha.COD_FILIAL,
      linha.CENTRO_CUSTO,
      linha.CLASSIFICACAO,
      linha.MES,
      linha.RECEITA || null
    );
    plano.planejado[chave] = Number(linha.VALOR);
  });

  const filiaisAtivas = config.find((linha) => linha.CHAVE === "filiaisAtivas");

  return {
    // `null` vale por "todas"; lista vazia significa que alguém desmarcou todas.
    configuracao: {
      filiaisAtivas: filiaisAtivas?.VALOR ? JSON.parse(filiaisAtivas.VALOR) : null,
    },
    visoes: [...porVisao.values()],
    planos: [...porPlano.values()],
  };
}

// --------------------------------------------------------------------------
// Configuração
// --------------------------------------------------------------------------

export async function salvarConfiguracao(chave, valor, login) {
  await query(
    `MERGE dbo.KING_PORTAL_ORC_CONFIGURACAO AS destino
     USING (SELECT @chave AS CHAVE) AS origem ON destino.CHAVE = origem.CHAVE
     WHEN MATCHED THEN UPDATE SET
       VALOR = @valor, ATUALIZADO_EM = SYSUTCDATETIME(), ATUALIZADO_POR = @por
     WHEN NOT MATCHED THEN INSERT (CHAVE, VALOR, ATUALIZADO_POR)
       VALUES (@chave, @valor, @por);`,
    { chave, valor: valor == null ? null : JSON.stringify(valor), por: login ?? null }
  );
}

// --------------------------------------------------------------------------
// Visão
// --------------------------------------------------------------------------

export async function salvarVisao({ id, nome, visaoContabil }, login) {
  await transaction(async ({ query: q }) => {
    const atual = await q("SELECT VISAO_CONTABIL FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @id", {
      id,
    });

    // Trocar a visão contábil invalida tudo que estava escolhido: os códigos de
    // uma não existem na outra. A regra vive aqui, e não só na tela, senão
    // sobrariam contas órfãs apontando para classificações inexistentes.
    const trocou = atual.length > 0 && atual[0].VISAO_CONTABIL !== (visaoContabil ?? null);

    await q(
      `MERGE dbo.KING_PORTAL_ORC_VISAO AS destino
       USING (SELECT @id AS ID) AS origem ON destino.ID = origem.ID
       WHEN MATCHED THEN UPDATE SET NOME = @nome, VISAO_CONTABIL = @contabil
       WHEN NOT MATCHED THEN INSERT (ID, NOME, VISAO_CONTABIL, CRIADO_POR)
         VALUES (@id, @nome, @contabil, @por);`,
      { id, nome, contabil: visaoContabil ?? null, por: login ?? null }
    );

    if (!trocou) return;
    for (const tabela of [
      "dbo.KING_PORTAL_ORC_VISAO_CONTA",
      "dbo.KING_PORTAL_ORC_VISAO_CENTRO",
      "dbo.KING_PORTAL_ORC_VISAO_SINAL",
      "dbo.KING_PORTAL_ORC_VISAO_MODULO",
    ]) {
      await q(`DELETE FROM ${tabela} WHERE VISAO_ID = @id`, { id });
    }
  });
}

export async function excluirVisao(id) {
  // As tabelas filhas caem por ON DELETE CASCADE.
  await query("DELETE FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @id", { id });
}

// Registra que o módulo existe nesta visão. `USA_CENTRO` fica em 1 porque a
// coluna ainda existe e é NOT NULL; ela deixou de decidir alguma coisa quando
// todo módulo passou a ser orçado por centro. Some no dia em que valer a pena
// um script de DDL só para isso.
export async function marcarModuloNaVisao(visaoId, modulo) {
  await query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO_MODULO
                     WHERE VISAO_ID = @visao AND MODULO = @modulo)
       INSERT INTO dbo.KING_PORTAL_ORC_VISAO_MODULO (VISAO_ID, MODULO, USA_CENTRO)
       VALUES (@visao, @modulo, 1)`,
    { visao: visaoId, modulo }
  );
}

// Substitui as contas de uma combinação filial × centro.
export async function definirContas(visaoId, modulo, filial, centro, contas) {
  await transaction(async ({ query: q }) => {
    await q(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
        WHERE VISAO_ID = @visao AND MODULO = @modulo
          AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro`,
      { visao: visaoId, modulo, filial, centro: centro ?? SEM_CENTRO }
    );

    for (const classificacao of contas ?? []) {
      await q(
        `INSERT INTO dbo.KING_PORTAL_ORC_VISAO_CONTA
           (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO)
         VALUES (@visao, @modulo, @filial, @centro, @conta)`,
        { visao: visaoId, modulo, filial, centro: centro ?? SEM_CENTRO, conta: classificacao }
      );
    }
  });
}

export async function definirUsoDoCentro(visaoId, modulo, filial, centro, usa) {
  if (usa) {
    // A linha do módulo era criada pelo antigo `definirUsaCentro`, que sumiu com
    // o interruptor. Sem ela o módulo não aparece como configurado na visão e a
    // Visão geral mostra o cartão desabilitado com os centros já marcados.
    await marcarModuloNaVisao(visaoId, modulo);
    await query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO
                       WHERE VISAO_ID = @visao AND MODULO = @modulo
                         AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro)
         INSERT INTO dbo.KING_PORTAL_ORC_VISAO_CENTRO
           (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO)
         VALUES (@visao, @modulo, @filial, @centro)`,
      { visao: visaoId, modulo, filial, centro }
    );
    return;
  }

  // Desligar o centro leva as contas dele junto: centro fora de uso não guarda
  // conta nenhuma.
  await transaction(async ({ query: q }) => {
    const alvo = { visao: visaoId, modulo, filial, centro };
    await q(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
        WHERE VISAO_ID = @visao AND MODULO = @modulo
          AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro`,
      alvo
    );
    await q(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO
        WHERE VISAO_ID = @visao AND MODULO = @modulo
          AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro`,
      alvo
    );
  });
}

export async function definirSinal(visaoId, modulo, classificacao, tipo) {
  if (tipo !== "receita" && tipo !== "despesa") {
    await query(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_SINAL
        WHERE VISAO_ID = @visao AND MODULO = @modulo AND CLASSIFICACAO = @conta`,
      { visao: visaoId, modulo, conta: classificacao }
    );
    return;
  }

  await query(
    `MERGE dbo.KING_PORTAL_ORC_VISAO_SINAL AS destino
     USING (SELECT @visao AS VISAO_ID, @modulo AS MODULO, @conta AS CLASSIFICACAO) AS origem
        ON destino.VISAO_ID = origem.VISAO_ID AND destino.MODULO = origem.MODULO
       AND destino.CLASSIFICACAO = origem.CLASSIFICACAO
     WHEN MATCHED THEN UPDATE SET TIPO = @tipo
     WHEN NOT MATCHED THEN INSERT (VISAO_ID, MODULO, CLASSIFICACAO, TIPO)
       VALUES (@visao, @modulo, @conta, @tipo);`,
    { visao: visaoId, modulo, conta: classificacao, tipo }
  );
}

// --------------------------------------------------------------------------
// Plano
// --------------------------------------------------------------------------

export async function salvarPlano({ id, nome, ano, visaoId }, login) {
  await query(
    `MERGE dbo.KING_PORTAL_ORC_PLANO AS destino
     USING (SELECT @id AS ID) AS origem ON destino.ID = origem.ID
     WHEN MATCHED THEN UPDATE SET NOME = @nome, ANO = @ano, VISAO_ID = @visao
     WHEN NOT MATCHED THEN INSERT (ID, NOME, ANO, VISAO_ID, CRIADO_POR)
       VALUES (@id, @nome, @ano, @visao, @por);`,
    { id, nome, ano, visao: visaoId ?? null, por: login ?? null }
  );
}

// --------------------------------------------------------------------------
// Grupos de centro de custo
//
// Configuração global, como as filiais em uso: um grupo junta centros de custo
// e serve de lente sobre o DRE. Não é visão — a visão diz o que cada módulo
// ORÇA e quais contas ele usa; o grupo só recorta POR ONDE ler o que já foi
// orçado.
// --------------------------------------------------------------------------

export async function listarGrupos() {
  const [grupos, centros] = await Promise.all([
    query("SELECT ID, NOME FROM dbo.KING_PORTAL_ORC_GRUPO ORDER BY NOME"),
    query("SELECT GRUPO_ID, CENTRO_CUSTO FROM dbo.KING_PORTAL_ORC_GRUPO_CENTRO"),
  ]);

  return grupos.map((grupo) => ({
    id: grupo.ID,
    nome: grupo.NOME,
    centros: centros.filter((c) => c.GRUPO_ID === grupo.ID).map((c) => c.CENTRO_CUSTO),
  }));
}

// Grava o grupo inteiro de uma vez. São dezenas de itens escolhidos numa tela
// só, e gravar item a item deixaria o grupo meio salvo se a rede caísse no meio.
export async function salvarGrupo({ id, nome, centros }, login) {
  if (!id || !String(nome ?? "").trim()) {
    const erro = new Error("Informe um nome para o grupo.");
    erro.status = 400;
    throw erro;
  }

  await transaction(async ({ query: q }) => {
    await q(
      `MERGE dbo.KING_PORTAL_ORC_GRUPO AS destino
       USING (SELECT @id AS ID) AS origem ON destino.ID = origem.ID
       WHEN MATCHED THEN UPDATE SET NOME = @nome
       WHEN NOT MATCHED THEN INSERT (ID, NOME, CRIADO_POR)
         VALUES (@id, @nome, @por);`,
      { id, nome: String(nome).trim(), por: login ?? null }
    );

    // Apagar e reinserir em vez de comparar: a lista vem inteira da tela, e
    // reconciliar item a item seria mais código para o mesmo resultado.
    await q("DELETE FROM dbo.KING_PORTAL_ORC_GRUPO_CENTRO WHERE GRUPO_ID = @id", { id });
    for (const centro of [...new Set(centros ?? [])]) {
      await q(
        `INSERT INTO dbo.KING_PORTAL_ORC_GRUPO_CENTRO (GRUPO_ID, CENTRO_CUSTO)
         VALUES (@id, @centro)`,
        { id, centro }
      );
    }

  });
}

export async function excluirGrupo(id) {
  // Centros e contas caem por ON DELETE CASCADE.
  await query("DELETE FROM dbo.KING_PORTAL_ORC_GRUPO WHERE ID = @id", { id });
}

// Cópia de um plano, com todo o planejado junto. O uso é "2026 ajustado": parte
// do que já existe e mexe no que mudou, em vez de redigitar doze meses.
//
// A cópia NÃO herda o vínculo com o Linx. Se herdasse, sincronizar a cópia
// apagaria o orçamento do original — a publicação limpa o orçamento antes de
// inserir, e os dois apontariam para o mesmo. Nascendo sem vínculo, a primeira
// sincronização cria um orçamento novo, e ter dois no mesmo exercício não
// incomoda o ERP: a chave de CTB_ORCAMENTO é só o ID_ORCAMENTO.
export async function duplicarPlano({ id, novoId, nome, ano }, login) {
  const [origem] = await query(
    "SELECT ID, VISAO_ID, ANO FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @id",
    { id }
  );

  if (!origem) {
    const erro = new Error("Plano de origem não encontrado.");
    erro.status = 404;
    throw erro;
  }

  await transaction(async ({ query: q }) => {
    await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_PLANO (ID, NOME, ANO, VISAO_ID, CRIADO_POR)
       VALUES (@novo, @nome, @ano, @visao, @por)`,
      { novo: novoId, nome, ano: ano ?? origem.ANO, visao: origem.VISAO_ID, por: login ?? null }
    );

    // Uma instrução só: copiar linha a linha seriam centenas de idas ao banco
    // para uma operação que o servidor resolve sozinho.
    await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_PLANEJADO
         (PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR, ALTERADO_POR)
       SELECT @novo, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR, @por
         FROM dbo.KING_PORTAL_ORC_PLANEJADO
        WHERE PLANO_ID = @id`,
      { novo: novoId, id, por: login ?? null }
    );
  });

  const [{ celulas }] = await query(
    "SELECT COUNT(*) AS celulas FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE PLANO_ID = @id",
    { id: novoId }
  );
  return { id: novoId, celulas };
}

// Desativar em vez de excluir: orçamento antigo é referência. Sai da lista mas
// segue respondendo "quanto a gente tinha previsto?", e o planejado de quem o
// montou não vira pó por um clique.
//
// O orçamento no Linx acompanha, marcado como INATIVO — senão o Power BI
// continuaria mostrando um cenário que o portal já aposentou.
export async function definirSituacaoDoPlano(id, situacao, login) {
  if (!["ativo", "inativo"].includes(situacao)) {
    const erro = new Error("Situação inválida.");
    erro.status = 400;
    throw erro;
  }

  await transaction(async ({ query: q }) => {
    await q(
      `UPDATE dbo.KING_PORTAL_ORC_PLANO
          SET SITUACAO = @situacao, SITUACAO_EM = SYSUTCDATETIME(), SITUACAO_POR = @por
        WHERE ID = @id`,
      { id, situacao, por: login ?? null }
    );

    const [plano] = await q(
      "SELECT ID_ORCAMENTO FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @id",
      { id }
    );
    if (plano?.ID_ORCAMENTO) {
      await q("UPDATE dbo.CTB_ORCAMENTO SET INATIVO = @inativo WHERE ID_ORCAMENTO = @orc", {
        orc: plano.ID_ORCAMENTO,
        inativo: situacao === "inativo",
      });
    }
  });
}

// Continua existindo para o caso de alguém precisar apagar de verdade — um plano
// criado por engano, sem nada dentro. Não é o que a tela oferece.
export async function excluirPlano(id) {
  await query("DELETE FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @id", { id });
}

// Grava um lote de células. É lote porque a tela preenche até doze meses de uma
// vez (arrastar a alça, Ctrl+Enter) e mandar doze requisições daria doze
// oportunidades de gravar metade.
//
// Valor zero APAGA a linha: célula sem valor digitado é zero por definição, e
// guardar zero encheria a tabela de nada.
export async function gravarPlanejado(planoId, celulas, login) {
  await transaction(async ({ query: q }) => {
    for (const celula of celulas ?? []) {
      const alvo = {
        plano: planoId,
        modulo: celula.modulo,
        filial: celula.filial,
        centro: celula.centro ?? SEM_CENTRO,
        conta: celula.conta,
        receita: celula.receita ?? SEM_CENTRO,
        mes: celula.mes,
      };

      if (!Number.isFinite(celula.valor) || celula.valor === 0) {
        await q(
          `DELETE FROM dbo.KING_PORTAL_ORC_PLANEJADO
            WHERE PLANO_ID = @plano AND MODULO = @modulo AND COD_FILIAL = @filial
              AND CENTRO_CUSTO = @centro AND CLASSIFICACAO = @conta
              AND RECEITA = @receita AND MES = @mes`,
          alvo
        );
        continue;
      }

      await q(
        `MERGE dbo.KING_PORTAL_ORC_PLANEJADO AS destino
         USING (SELECT @plano AS PLANO_ID, @modulo AS MODULO, @filial AS COD_FILIAL,
                       @centro AS CENTRO_CUSTO, @conta AS CLASSIFICACAO,
                       @receita AS RECEITA, @mes AS MES) AS origem
            ON destino.PLANO_ID = origem.PLANO_ID AND destino.MODULO = origem.MODULO
           AND destino.COD_FILIAL = origem.COD_FILIAL AND destino.CENTRO_CUSTO = origem.CENTRO_CUSTO
           AND destino.CLASSIFICACAO = origem.CLASSIFICACAO AND destino.RECEITA = origem.RECEITA
           AND destino.MES = origem.MES
         WHEN MATCHED THEN UPDATE SET
           VALOR = @valor, ALTERADO_EM = SYSUTCDATETIME(), ALTERADO_POR = @por
         WHEN NOT MATCHED THEN INSERT
           (PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR, ALTERADO_POR)
           VALUES (@plano, @modulo, @filial, @centro, @conta, @receita, @mes, @valor, @por);`,
        { ...alvo, valor: celula.valor, por: login ?? null }
      );
    }
  });
}

// --------------------------------------------------------------------------
// Importação do que ficou no navegador
//
// Uma vez só, e apenas com o banco vazio: isto não é "sincronizar", é trazer o
// que já existia antes da migração. Com dado no banco, uma segunda importação
// sobrescreveria o trabalho de outra pessoa.
// --------------------------------------------------------------------------

export async function bancoVazio() {
  const linha = await query(
    `SELECT (SELECT COUNT(*) FROM dbo.KING_PORTAL_ORC_VISAO)
          + (SELECT COUNT(*) FROM dbo.KING_PORTAL_ORC_PLANO) AS total`
  );
  return linha[0]?.total === 0;
}

export async function importar(estado, login) {
  if (!(await bancoVazio())) {
    const erro = new Error("Já existem visões ou planos no banco — a importação só vale uma vez.");
    erro.status = 409;
    throw erro;
  }

  if (estado?.configuracao?.filiaisAtivas !== undefined) {
    await salvarConfiguracao("filiaisAtivas", estado.configuracao.filiaisAtivas, login);
  }

  for (const visao of estado?.visoes ?? []) {
    await salvarVisao(visao, login);

    for (const [moduloId, modulo] of Object.entries(visao.modulos ?? {})) {
      await marcarModuloNaVisao(visao.id, moduloId);

      for (const [conta, tipo] of Object.entries(modulo.sinais ?? {})) {
        await definirSinal(visao.id, moduloId, conta, tipo);
      }

      for (const [filialId, daFilial] of Object.entries(modulo.filiais ?? {})) {
        // Quem manda são os centros; a lista da filial é derivada na leitura, e
        // gravá-la também criaria linhas que ninguém lê.
        for (const [centroId, doCentro] of Object.entries(daFilial.centros ?? {})) {
          await definirUsoDoCentro(visao.id, moduloId, filialId, centroId, true);
          if (doCentro.length) {
            await definirContas(visao.id, moduloId, filialId, centroId, doCentro);
          }
        }
      }
    }
  }

  for (const plano of estado?.planos ?? []) {
    await salvarPlano(plano, login);

    const celulas = Object.entries(plano.planejado ?? {}).map(([chave, valor]) => {
      const [modulo, filial, centro, conta, mes, receita] = chave.split("|");
      return { modulo, filial, centro, conta, receita: receita ?? "", mes: Number(mes), valor };
    });

    // Em lotes: um plano preenchido tem milhares de células, e uma transação
    // única desse tamanho segura o banco por tempo demais.
    for (let inicio = 0; inicio < celulas.length; inicio += 200) {
      await gravarPlanejado(plano.id, celulas.slice(inicio, inicio + 200), login);
    }
  }

  return {
    visoes: estado?.visoes?.length ?? 0,
    planos: estado?.planos?.length ?? 0,
    celulas: (estado?.planos ?? []).reduce(
      (total, plano) => total + Object.keys(plano.planejado ?? {}).length,
      0
    ),
  };
}

// Filial que sai do ERP deixa edições órfãs em todos os planos.
export async function purgarFilial(filialId) {
  await transaction(async ({ query: q }) => {
    for (const tabela of [
      "dbo.KING_PORTAL_ORC_PLANEJADO",
      "dbo.KING_PORTAL_ORC_VISAO_CONTA",
      "dbo.KING_PORTAL_ORC_VISAO_CENTRO",
    ]) {
      await q(`DELETE FROM ${tabela} WHERE COD_FILIAL = @filial`, { filial: filialId });
    }
  });
}
