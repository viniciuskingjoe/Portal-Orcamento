import { query, transaction } from "./sqlserver.js";
import { chaveFuncionario, chavePlanejado } from "../src/dados/plano.js";
import { referenciasDaFormula } from "../src/dados/formula.js";
import { ehModulo, MODULO_OPERACIONAIS, MODULO_PESSOAL } from "../src/dados/modulos.js";
import { filtrarEstadoPorSessao } from "./escopo.js";
import {
  exigirPlanoAtivo,
  indexarMapeamentos,
  validarCelulasDeFuncionarios,
  validarCelulasPlanejadas,
  validarAlteracaoModulo,
  validarExclusividadeDeMapeamentos,
  validarFiliaisAtivas,
  validarLinhaDre,
  validarPlano,
  validarVisao,
} from "./validacao.js";

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

// Mesma cautela para a tabela do sql/009: um banco que ficou no 008 responde
// sem quantidade nenhuma em vez de derrubar a carga inteira.
const tabelasConhecidas = new Map();

async function temTabela(nome) {
  if (!tabelasConhecidas.has(nome)) {
    const [linha] = await query("SELECT OBJECT_ID(@n, 'U') AS tem", { n: nome });
    tabelasConhecidas.set(nome, linha?.tem != null);
  }
  return tabelasConhecidas.get(nome);
}

const temFuncionarios = () => temTabela("dbo.KING_PORTAL_ORC_FUNCIONARIO");
const temFormulas = () => temTabela("dbo.KING_PORTAL_ORC_VISAO_FORMULA");
const temDre = () => temTabela("dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA");
const temUnidadeDre = () => temColuna("dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA", "UNIDADE");
const temSinalContaDre = () => temColuna("dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA", "SINAL");

// --------------------------------------------------------------------------
// Leitura
// --------------------------------------------------------------------------

export async function carregarEstado(sessao, { executar = query } = {}) {
  // Esquema e dados são independentes. Descobrir tudo primeiro elimina quatro
  // waterfalls da rota mais usada e permite disparar as leituras numa rodada.
  const [
    comFuncionarios,
    comFormulas,
    comDre,
    comUnidadeDre,
    comSinalContaDre,
    comPublicacao,
    comSituacao,
  ] = await Promise.all([
    temFuncionarios(),
    temFormulas(),
    temDre(),
    temUnidadeDre(),
    temSinalContaDre(),
    temPublicacao(),
    temSituacao(),
  ]);

  // O filtro puro no final continua sendo a última barreira de segurança. Estes
  // EXISTS evitam antes disso carregar milhares de células que a sessão jamais
  // poderia ver — o maior custo da resposta conforme os anos se acumulam.
  const recortarValores = sessao?.admin !== true && Boolean(sessao?.login);
  const parametrosDeEscopo = recortarValores ? { loginEscopo: sessao.login } : {};
  const ondePlanejado = recortarValores
    ? `WHERE EXISTS (
         SELECT 1 FROM dbo.KING_PORTAL_ORC_ACESSO AS a
          WHERE a.LOGIN = @loginEscopo
            AND (a.MODULO IS NULL OR a.MODULO = p.MODULO)
            AND (a.COD_FILIAL IS NULL OR a.COD_FILIAL = p.COD_FILIAL)
            AND (a.CENTRO_CUSTO IS NULL OR a.CENTRO_CUSTO = p.CENTRO_CUSTO)
       )`
    : "";
  const ondeFuncionarios = recortarValores
    ? `WHERE EXISTS (
         SELECT 1 FROM dbo.KING_PORTAL_ORC_ACESSO AS a
          WHERE a.LOGIN = @loginEscopo
            AND (a.MODULO IS NULL OR a.MODULO = 'despesas-pessoal')
            AND (a.COD_FILIAL IS NULL OR a.COD_FILIAL = f.COD_FILIAL)
            AND (a.CENTRO_CUSTO IS NULL OR a.CENTRO_CUSTO = f.CENTRO_CUSTO)
       )`
    : "";

  const [
    config,
    visoes,
    modulos,
    centros,
    contas,
    sinais,
    planos,
    planejado,
    funcionarios,
    formulas,
    dreLinhas,
    dreLinhaContas,
  ] = await Promise.all([
    executar("SELECT CHAVE, VALOR FROM dbo.KING_PORTAL_ORC_CONFIGURACAO"),
    executar("SELECT ID, NOME, VISAO_CONTABIL FROM dbo.KING_PORTAL_ORC_VISAO ORDER BY NOME"),
    executar("SELECT VISAO_ID, MODULO, USA_CENTRO FROM dbo.KING_PORTAL_ORC_VISAO_MODULO"),
    executar(
      "SELECT VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO"
    ),
    executar(
      `SELECT VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO
         FROM dbo.KING_PORTAL_ORC_VISAO_CONTA ORDER BY CLASSIFICACAO`
    ),
    executar("SELECT VISAO_ID, MODULO, CLASSIFICACAO, TIPO FROM dbo.KING_PORTAL_ORC_VISAO_SINAL"),
    executar(
      `SELECT ID, NOME, ANO, VISAO_ID${
        comPublicacao ? ", ID_ORCAMENTO, PUBLICADO_EM, PUBLICADO_LINHAS" : ""
      }${comSituacao ? ", SITUACAO" : ""}
         FROM dbo.KING_PORTAL_ORC_PLANO ORDER BY ANO DESC, NOME`
    ),
    executar(
      `SELECT p.PLANO_ID, p.MODULO, p.COD_FILIAL, p.CENTRO_CUSTO,
              p.CLASSIFICACAO, p.RECEITA, p.MES, p.VALOR
         FROM dbo.KING_PORTAL_ORC_PLANEJADO AS p
         ${ondePlanejado}`,
      parametrosDeEscopo
    ),
    comFuncionarios
      ? executar(
          `SELECT f.PLANO_ID, f.COD_FILIAL, f.CENTRO_CUSTO, f.MES, f.QUANTIDADE
             FROM dbo.KING_PORTAL_ORC_FUNCIONARIO AS f
             ${ondeFuncionarios}`,
          parametrosDeEscopo
        )
      : Promise.resolve([]),
    comFormulas
      ? executar(
          `SELECT VISAO_ID, MODULO, CLASSIFICACAO, EXPRESSAO
             FROM dbo.KING_PORTAL_ORC_VISAO_FORMULA`
        )
      : Promise.resolve([]),
    comDre
      ? executar(
          `SELECT VISAO_ID, ID, ORDEM, TITULO, ORIGEM, MODULO_ID, SINAL, FORMULA,
                  MOSTRA, DESTACA, BASE_ANALISE_VERTICAL, LINHA_PRINCIPAL${
                    comUnidadeDre ? ", UNIDADE" : ""
                  }
             FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA ORDER BY VISAO_ID, ORDEM`
        )
      : Promise.resolve([]),
    comDre
      ? executar(
          `SELECT VISAO_ID, LINHA_ID, CLASSIFICACAO${comSinalContaDre ? ", SINAL" : ""}
             FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA`
        )
      : Promise.resolve([]),
  ]);

  const porVisao = new Map(
    visoes.map((linha) => [
      linha.ID,
      {
        id: linha.ID,
        nome: linha.NOME,
        visaoContabil: linha.VISAO_CONTABIL,
        modulos: {},
        dreLinhas: [],
      },
    ])
  );

  const moduloDe = (visaoId, moduloId) => {
    const visao = porVisao.get(visaoId);
    if (!visao) return null;
    visao.modulos[moduloId] ??= { sinais: {}, formulas: {}, filiais: {} };
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

  formulas.forEach((linha) => {
    const modulo = moduloDe(linha.VISAO_ID, linha.MODULO);
    if (modulo) modulo.formulas[linha.CLASSIFICACAO] = { expressao: linha.EXPRESSAO };
  });

  const valoresDaLinhaDre = new Map();
  dreLinhaContas.forEach((linha) => {
    const chave = `${linha.VISAO_ID}|${linha.LINHA_ID}`;
    if (!valoresDaLinhaDre.has(chave)) valoresDaLinhaDre.set(chave, []);
    valoresDaLinhaDre.get(chave).push({ codigo: linha.CLASSIFICACAO, sinal: linha.SINAL ?? 1 });
  });

  dreLinhas.forEach((linha) => {
    const visao = porVisao.get(linha.VISAO_ID);
    if (!visao) return;
    visao.dreLinhas.push({
      id: linha.ID,
      ordem: linha.ORDEM,
      titulo: linha.TITULO,
      origem: linha.ORIGEM,
      moduloId: linha.MODULO_ID ?? null,
      sinal: linha.SINAL ?? null,
      formula: linha.FORMULA ?? null,
      valores: valoresDaLinhaDre.get(`${linha.VISAO_ID}|${linha.ID}`) ?? [],
      mostra: !!linha.MOSTRA,
      destaca: !!linha.DESTACA,
      baseAnaliseVertical: !!linha.BASE_ANALISE_VERTICAL,
      linhaPrincipal: !!linha.LINHA_PRINCIPAL,
      unidade: linha.UNIDADE === "percentual" ? "percentual" : "moeda",
    });
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
        // Mapa separado do planejado: quantidade de pessoas não é dinheiro e
        // não pode cair numa soma de reais por descuido.
        funcionarios: {},
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

  funcionarios.forEach((linha) => {
    const plano = porPlano.get(linha.PLANO_ID);
    if (!plano) return;
    const chave = chaveFuncionario(linha.COD_FILIAL, linha.CENTRO_CUSTO, linha.MES);
    plano.funcionarios[chave] = Number(linha.QUANTIDADE);
  });

  const filiaisAtivas = config.find((linha) => linha.CHAVE === "filiaisAtivas");

  const estado = {
    // `null` vale por "todas"; lista vazia significa que alguém desmarcou todas.
    configuracao: {
      filiaisAtivas: filiaisAtivas?.VALOR ? JSON.parse(filiaisAtivas.VALOR) : null,
    },
    visoes: [...porVisao.values()],
    planos: [...porPlano.values()],
  };

  return filtrarEstadoPorSessao(estado, sessao);
}

// Liga cada linha do realizado ao módulo que a visão do portal lhe atribuiu.
// A consulta financeira continua no ERP; este mapa serve apenas para aplicar o
// mesmo recorte de permissão antes de a resposta sair da API.
export async function listarVinculosDoRealizado(visaoContabil = null) {
  return query(
    `SELECT DISTINCT RTRIM(v.VISAO_CONTABIL) AS visaoContabil,
            vc.MODULO AS modulo, vc.COD_FILIAL AS filial,
            vc.CENTRO_CUSTO AS centro, vc.CLASSIFICACAO AS classificacao
       FROM dbo.KING_PORTAL_ORC_VISAO_CONTA AS vc
       INNER JOIN dbo.KING_PORTAL_ORC_VISAO AS v ON v.ID = vc.VISAO_ID
      WHERE (@visao IS NULL OR v.VISAO_CONTABIL = @visao)`,
    { visao: visaoContabil || null }
  );
}

// --------------------------------------------------------------------------
// Configuração
// --------------------------------------------------------------------------

async function salvarConfiguracaoCom(executar, chave, valor, login) {
  await executar(
    `MERGE dbo.KING_PORTAL_ORC_CONFIGURACAO AS destino
     USING (SELECT @chave AS CHAVE) AS origem ON destino.CHAVE = origem.CHAVE
     WHEN MATCHED THEN UPDATE SET
       VALOR = @valor, ATUALIZADO_EM = SYSUTCDATETIME(), ATUALIZADO_POR = @por
     WHEN NOT MATCHED THEN INSERT (CHAVE, VALOR, ATUALIZADO_POR)
       VALUES (@chave, @valor, @por);`,
    { chave, valor: valor == null ? null : JSON.stringify(valor), por: login ?? null }
  );
}

export async function salvarConfiguracao(chave, valor, login) {
  await salvarConfiguracaoCom(query, chave, valor, login);
}

// --------------------------------------------------------------------------
// Visão
// --------------------------------------------------------------------------

async function salvarVisaoCom(
  q,
  { id, nome, visaoContabil },
  login,
  { comFuncionarios = false, comFormulas = false, comDre = false } = {}
) {
  const atual = await q(
    "SELECT VISAO_CONTABIL FROM dbo.KING_PORTAL_ORC_VISAO WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id",
    { id }
  );

  // Trocar a visão contábil invalida módulos, fórmulas e DRE. Com lançamentos já
  // feitos, limpar a configuração esconderia dinheiro sem apagar o histórico;
  // por isso a operação precisa ser explícita em uma visão nova.
  const trocou = atual.length > 0 && atual[0].VISAO_CONTABIL !== (visaoContabil ?? null);
  if (trocou) {
    const [emUso] = await q(
      `SELECT TOP 1 p.ID
         FROM dbo.KING_PORTAL_ORC_PLANO AS p
        WHERE p.VISAO_ID = @id
          AND (
            EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_PLANEJADO AS x WHERE x.PLANO_ID = p.ID)
            ${
              comFuncionarios
                ? "OR EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_FUNCIONARIO AS f WHERE f.PLANO_ID = p.ID)"
                : ""
            }
          )`,
      { id }
    );
    if (emUso) {
      const erro = new Error(
        `A visão contábil não pode mudar porque o plano ${emUso.ID} já possui lançamentos. ` +
          "Crie uma nova visão para preservar o histórico."
      );
      erro.status = 409;
      throw erro;
    }
  }

  await q(
    `MERGE dbo.KING_PORTAL_ORC_VISAO AS destino
     USING (SELECT @id AS ID) AS origem ON destino.ID = origem.ID
     WHEN MATCHED THEN UPDATE SET NOME = @nome, VISAO_CONTABIL = @contabil
     WHEN NOT MATCHED THEN INSERT (ID, NOME, VISAO_CONTABIL, CRIADO_POR)
       VALUES (@id, @nome, @contabil, @por);`,
    { id, nome, contabil: visaoContabil ?? null, por: login ?? null }
  );

  if (!trocou) return;
  // DRE_LINHA leva DRE_LINHA_CONTA por cascade. Fórmulas e DRE não apontam por
  // FK para VISAO_MODULO, então precisam ser removidos explicitamente antes da
  // nova configuração.
  if (comDre) {
    await q("DELETE FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA WHERE VISAO_ID = @id", { id });
  }
  if (comFormulas) {
    await q("DELETE FROM dbo.KING_PORTAL_ORC_VISAO_FORMULA WHERE VISAO_ID = @id", { id });
  }
  for (const tabela of [
    "dbo.KING_PORTAL_ORC_VISAO_CONTA",
    "dbo.KING_PORTAL_ORC_VISAO_CENTRO",
    "dbo.KING_PORTAL_ORC_VISAO_SINAL",
    "dbo.KING_PORTAL_ORC_VISAO_MODULO",
  ]) {
    await q(`DELETE FROM ${tabela} WHERE VISAO_ID = @id`, { id });
  }
}

export async function salvarVisao(visao, login) {
  const [comFuncionarios, comFormulas, comDre] = await Promise.all([
    temFuncionarios(),
    temFormulas(),
    temDre(),
  ]);
  await transaction(async ({ query: q }) => {
    await salvarVisaoCom(q, visao, login, { comFuncionarios, comFormulas, comDre });
  });
}

export async function excluirVisao(id) {
  await transaction(async ({ query: q }) => {
    const [plano] = await q(
      `SELECT TOP 1 ID FROM dbo.KING_PORTAL_ORC_PLANO WITH (UPDLOCK, HOLDLOCK)
        WHERE VISAO_ID = @id`,
      { id }
    );
    if (plano) {
      const erro = new Error(`A visão é usada pelo plano ${plano.ID} e não pode ser excluída.`);
      erro.status = 409;
      throw erro;
    }
    await q("DELETE FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @id", { id });
  });
}

// Registra que o módulo existe nesta visão. `USA_CENTRO` fica em 1 porque a
// coluna ainda existe e é NOT NULL; ela deixou de decidir alguma coisa quando
// todo módulo passou a ser orçado por centro. Some no dia em que valer a pena
// um script de DDL só para isso.
async function marcarModuloCom(executar, visaoId, modulo) {
  await executar(
    `IF NOT EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO_MODULO
                     WHERE VISAO_ID = @visao AND MODULO = @modulo)
       INSERT INTO dbo.KING_PORTAL_ORC_VISAO_MODULO (VISAO_ID, MODULO, USA_CENTRO)
       VALUES (@visao, @modulo, 1)`,
    { visao: visaoId, modulo }
  );
}

export async function marcarModuloNaVisao(visaoId, modulo) {
  await marcarModuloCom(query, visaoId, modulo);
}

// Substitui as contas de uma combinação filial × centro.
async function definirContasCom(executar, visaoId, modulo, filial, centro, contas) {
  await executar(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
        WHERE VISAO_ID = @visao AND MODULO = @modulo
          AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro`,
      { visao: visaoId, modulo, filial, centro: centro ?? SEM_CENTRO }
  );

  for (const classificacao of contas ?? []) {
    await executar(
        `INSERT INTO dbo.KING_PORTAL_ORC_VISAO_CONTA
           (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO)
         VALUES (@visao, @modulo, @filial, @centro, @conta)`,
        { visao: visaoId, modulo, filial, centro: centro ?? SEM_CENTRO, conta: classificacao }
    );
  }
}

function moduloPar(modulo) {
  if (modulo === MODULO_PESSOAL) return MODULO_OPERACIONAIS;
  if (modulo === MODULO_OPERACIONAIS) return MODULO_PESSOAL;
  return null;
}

async function garantirExclusividadeCom(q, visaoId, modulo, filial, centro, contas) {
  const par = moduloPar(modulo);
  if (!par || !contas.length) return;
  for (const conta of contas) {
    await q(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
        WHERE VISAO_ID = @visao AND MODULO = @par AND COD_FILIAL = @filial
          AND CENTRO_CUSTO = @centro AND CLASSIFICACAO = @conta`,
      { visao: visaoId, par, filial, centro: centro ?? SEM_CENTRO, conta }
    );
  }
}

export async function definirContas(visaoId, modulo, filial, centro, contas) {
  await transaction(async ({ query: q }) => {
    await definirContasCom(q, visaoId, modulo, filial, centro, contas);
    await garantirExclusividadeCom(q, visaoId, modulo, filial, centro, contas);
  });
}

async function definirUsoDoCentroCom(executar, visaoId, modulo, filial, centro, usa) {
  if (usa) {
    // A linha do módulo era criada pelo antigo `definirUsaCentro`, que sumiu com
    // o interruptor. Sem ela o módulo não aparece como configurado na visão e a
    // Visão geral mostra o cartão desabilitado com os centros já marcados.
    await marcarModuloCom(executar, visaoId, modulo);
    await executar(
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
  const alvo = { visao: visaoId, modulo, filial, centro };
  await executar(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
        WHERE VISAO_ID = @visao AND MODULO = @modulo
          AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro`,
      alvo
  );
  await executar(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO
        WHERE VISAO_ID = @visao AND MODULO = @modulo
          AND COD_FILIAL = @filial AND CENTRO_CUSTO = @centro`,
      alvo
  );
}

export async function definirUsoDoCentro(visaoId, modulo, filial, centro, usa) {
  await transaction(async ({ query: q }) => {
    await definirUsoDoCentroCom(q, visaoId, modulo, filial, centro, usa);
  });
}

async function definirSinalCom(executar, visaoId, modulo, classificacao, tipo) {
  if (tipo !== "receita" && tipo !== "despesa") {
    await executar(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_SINAL
        WHERE VISAO_ID = @visao AND MODULO = @modulo AND CLASSIFICACAO = @conta`,
      { visao: visaoId, modulo, conta: classificacao }
    );
    return;
  }

  await executar(
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

export async function definirSinal(visaoId, modulo, classificacao, tipo) {
  await definirSinalCom(query, visaoId, modulo, classificacao, tipo);
}

// Fixa (ausência de linha) ou calculada (expressão gravada). `expressao` vazia
// ou `null` volta a conta para fixa — mesma convenção de `definirSinal`.
async function definirFormulaCom(executar, visaoId, modulo, classificacao, expressao, login) {
  if (!expressao) {
    await executar(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_FORMULA
        WHERE VISAO_ID = @visao AND MODULO = @modulo AND CLASSIFICACAO = @conta`,
      { visao: visaoId, modulo, conta: classificacao }
    );
    return;
  }

  await executar(
    `MERGE dbo.KING_PORTAL_ORC_VISAO_FORMULA AS destino
     USING (SELECT @visao AS VISAO_ID, @modulo AS MODULO, @conta AS CLASSIFICACAO) AS origem
        ON destino.VISAO_ID = origem.VISAO_ID AND destino.MODULO = origem.MODULO
       AND destino.CLASSIFICACAO = origem.CLASSIFICACAO
     WHEN MATCHED THEN UPDATE SET EXPRESSAO = @expressao, ATUALIZADO_EM = SYSUTCDATETIME(), ATUALIZADO_POR = @login
     WHEN NOT MATCHED THEN INSERT (VISAO_ID, MODULO, CLASSIFICACAO, EXPRESSAO, ATUALIZADO_POR)
       VALUES (@visao, @modulo, @conta, @expressao, @login);`,
    { visao: visaoId, modulo, conta: classificacao, expressao, login: login ?? null }
  );
}

export async function definirFormula(visaoId, modulo, classificacao, expressao, login) {
  await definirFormulaCom(query, visaoId, modulo, classificacao, expressao, login);
}

// Uma requisição pode alterar dezenas de filiais no mapeamento padrão. O corpo
// inteiro já chega validado; esta transação garante que ou todas as combinações
// mudam, ou nenhuma muda.
export async function salvarModulo(visaoId, modulo, mudanca, login) {
  await transaction(async ({ query: q }) => {
    const [visao] = await q(
      "SELECT ID FROM dbo.KING_PORTAL_ORC_VISAO WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id",
      { id: visaoId }
    );
    if (!visao) {
      const erro = new Error("Visão não encontrada.");
      erro.status = 404;
      throw erro;
    }

    for (const lote of mudanca.lotes ?? []) {
      await definirContasCom(q, visaoId, modulo, lote.filial, lote.centro, lote.contas);
      await garantirExclusividadeCom(q, visaoId, modulo, lote.filial, lote.centro, lote.contas);
    }
    if (mudanca.usoDoCentro !== undefined) {
      await definirUsoDoCentroCom(
        q,
        visaoId,
        modulo,
        mudanca.filial,
        mudanca.centro,
        mudanca.usoDoCentro
      );
    }
    if (mudanca.contas !== undefined) {
      await definirContasCom(q, visaoId, modulo, mudanca.filial, mudanca.centro, mudanca.contas);
      await garantirExclusividadeCom(q, visaoId, modulo, mudanca.filial, mudanca.centro, mudanca.contas);
    }
    if (mudanca.sinal !== undefined) {
      await definirSinalCom(q, visaoId, modulo, mudanca.sinal.conta, mudanca.sinal.tipo);
    }
    if (mudanca.formula !== undefined) {
      if (mudanca.formula.expressao) {
        const mapeados = await q(
          `SELECT COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO
             FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
            WHERE VISAO_ID = @visao AND MODULO = @modulo`,
          { visao: visaoId, modulo }
        );
        const chaves = new Set(
          mapeados.map(
            (item) => `${item.COD_FILIAL}|${item.CENTRO_CUSTO}|${item.CLASSIFICACAO}`
          )
        );
        const alvos = mapeados.filter(
          (item) => item.CLASSIFICACAO === mudanca.formula.conta
        );
        if (!alvos.length) {
          const erro = new Error("A conta calculada precisa estar mapeada no módulo antes de receber fórmula.");
          erro.status = 409;
          throw erro;
        }
        for (const referencia of referenciasDaFormula(mudanca.formula.expressao)) {
          if (referencia.codigo === "funcionarios") continue;
          const faltando = alvos.find(
            (alvo) =>
              !chaves.has(
                `${alvo.COD_FILIAL}|${alvo.CENTRO_CUSTO}|${referencia.codigo}`
              )
          );
          if (faltando) {
            const erro = new Error(
              `A conta ${referencia.codigo} não está mapeada em ${faltando.COD_FILIAL}/${faltando.CENTRO_CUSTO}, onde a fórmula será calculada.`
            );
            erro.status = 409;
            throw erro;
          }
        }
      }
      await definirFormulaCom(
        q,
        visaoId,
        modulo,
        mudanca.formula.conta,
        mudanca.formula.expressao,
        login
      );
    }
  });
}

// Uma configuração como "preencher com o padrão" atravessa vários módulos.
// O lock da visão serializa administradores concorrentes, e a transação torna
// o conjunto inteiro indivisível: ou todos os centros mudam, ou nenhum muda.
export async function salvarMapeamentos(visaoId, mapeamentos) {
  await transaction(async ({ query: q }) => {
    const [visao] = await q(
      "SELECT ID FROM dbo.KING_PORTAL_ORC_VISAO WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id",
      { id: visaoId }
    );
    if (!visao) {
      const erro = new Error("Visão não encontrada.");
      erro.status = 404;
      throw erro;
    }

    for (const item of mapeamentos) {
      await definirContasCom(q, visaoId, item.modulo, item.filial, item.centro, item.contas);
      await garantirExclusividadeCom(
        q,
        visaoId,
        item.modulo,
        item.filial,
        item.centro,
        item.contas
      );
    }

    const [duplicada] = await q(
      `SELECT TOP 1 pessoal.COD_FILIAL, pessoal.CENTRO_CUSTO, pessoal.CLASSIFICACAO
         FROM dbo.KING_PORTAL_ORC_VISAO_CONTA AS pessoal
         INNER JOIN dbo.KING_PORTAL_ORC_VISAO_CONTA AS operacional
                 ON operacional.VISAO_ID = pessoal.VISAO_ID
                AND operacional.COD_FILIAL = pessoal.COD_FILIAL
                AND operacional.CENTRO_CUSTO = pessoal.CENTRO_CUSTO
                AND operacional.CLASSIFICACAO = pessoal.CLASSIFICACAO
        WHERE pessoal.VISAO_ID = @visao AND pessoal.MODULO = @pessoal
          AND operacional.MODULO = @operacional`,
      { visao: visaoId, pessoal: MODULO_PESSOAL, operacional: MODULO_OPERACIONAIS }
    );
    if (duplicada) {
      const erro = new Error(
        `A conta ${duplicada.CLASSIFICACAO} não pode ficar em Pessoal e Operacionais no mesmo centro.`
      );
      erro.status = 409;
      throw erro;
    }
  });
}

export async function visaoContabilDaVisao(visaoId) {
  const [visao] = await query(
    "SELECT VISAO_CONTABIL FROM dbo.KING_PORTAL_ORC_VISAO WHERE ID = @id",
    { id: visaoId }
  );
  if (!visao) {
    const erro = new Error("Visão não encontrada.");
    erro.status = 404;
    throw erro;
  }
  return visao.VISAO_CONTABIL;
}

// --------------------------------------------------------------------------
// DRE — linhas do demonstrativo, por visão
//
// Cada linha soma um recorte de contas de UM módulo (fixo por linha, não o
// módulo inteiro) ou é uma fórmula que referencia outras linhas — nunca as
// duas coisas na mesma linha, e o array `contas` é irrelevante quando
// `origem = 'formula'`.
//
// `baseAnaliseVertical`/`linhaPrincipal` valem para uma linha só por visão;
// o banco não tem como impor isso sozinho (índice único condicional exigiria
// filtro parcial), então quem grava desliga a marca de qualquer outra linha
// antes de gravar a nova — dentro da mesma transação, para nunca existirem
// duas marcadas ao mesmo tempo nem nenhuma por uma falha no meio.
// --------------------------------------------------------------------------

async function salvarLinhaDreCom(
  q,
  visaoId,
  linha,
  login,
  { comUnidade = false, comSinalConta = false } = {}
) {
    if (linha.baseAnaliseVertical) {
      await q(
        `UPDATE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA SET BASE_ANALISE_VERTICAL = 0
          WHERE VISAO_ID = @visao AND ID <> @id`,
        { visao: visaoId, id: linha.id }
      );
    }
    if (linha.linhaPrincipal) {
      await q(
        `UPDATE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA SET LINHA_PRINCIPAL = 0
          WHERE VISAO_ID = @visao AND ID <> @id`,
        { visao: visaoId, id: linha.id }
      );
    }

    await q(
      `MERGE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA AS destino
       USING (SELECT @visao AS VISAO_ID, @id AS ID) AS origem
          ON destino.VISAO_ID = origem.VISAO_ID AND destino.ID = origem.ID
       WHEN MATCHED THEN UPDATE SET
         ORDEM = @ordem, TITULO = @titulo, ORIGEM = @origemTipo, MODULO_ID = @moduloId,
         SINAL = @sinal, FORMULA = @formula, MOSTRA = @mostra, DESTACA = @destaca,
         BASE_ANALISE_VERTICAL = @base, LINHA_PRINCIPAL = @principal${
           comUnidade ? ", UNIDADE = @unidade" : ""
         },
         ATUALIZADO_EM = SYSUTCDATETIME(), ATUALIZADO_POR = @login
       WHEN NOT MATCHED THEN INSERT
         (VISAO_ID, ID, ORDEM, TITULO, ORIGEM, MODULO_ID, SINAL, FORMULA, MOSTRA, DESTACA,
          BASE_ANALISE_VERTICAL, LINHA_PRINCIPAL${comUnidade ? ", UNIDADE" : ""}, ATUALIZADO_POR)
         VALUES (@visao, @id, @ordem, @titulo, @origemTipo, @moduloId, @sinal, @formula, @mostra,
                 @destaca, @base, @principal${comUnidade ? ", @unidade" : ""}, @login);`,
      {
        visao: visaoId,
        id: linha.id,
        ordem: linha.ordem ?? 0,
        titulo: linha.titulo,
        origemTipo: linha.origem,
        moduloId: linha.origem === "modulo" ? (linha.moduloId ?? null) : null,
        sinal: linha.origem === "modulo" ? (linha.sinal ?? null) : null,
        formula: linha.origem === "formula" ? (linha.formula ?? null) : null,
        mostra: linha.mostra !== false,
        destaca: linha.destaca === true,
        base: linha.baseAnaliseVertical === true,
        principal: linha.linhaPrincipal === true,
        ...(comUnidade ? { unidade: linha.unidade === "percentual" ? "percentual" : "moeda" } : {}),
        login: login ?? null,
      }
    );

    // Contas só fazem sentido em linha "modulo" — mas limpa e regrava sempre,
    // para uma linha que virou "formula" não deixar contas órfãs pra trás.
    await q(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA WHERE VISAO_ID = @visao AND LINHA_ID = @id`,
      { visao: visaoId, id: linha.id }
    );
    if (linha.origem === "modulo") {
      for (const item of linha.valores ?? []) {
        await q(
          `INSERT INTO dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA_CONTA (VISAO_ID, LINHA_ID, CLASSIFICACAO${
            comSinalConta ? ", SINAL" : ""
          })
           VALUES (@visao, @id, @conta${comSinalConta ? ", @sinal" : ""})`,
          {
            visao: visaoId,
            id: linha.id,
            conta: item.codigo,
            ...(comSinalConta ? { sinal: item.sinal === -1 ? -1 : 1 } : {}),
          }
        );
      }
    }
}

export async function salvarLinhaDre(visaoId, linha, login) {
  const [comUnidade, comSinalConta] = await Promise.all([
    temUnidadeDre(),
    temSinalContaDre(),
  ]);
  await transaction(async ({ query: q }) => {
    await salvarLinhaDreCom(q, visaoId, linha, login, { comUnidade, comSinalConta });
  });
}

export async function excluirLinhaDre(visaoId, linhaId) {
  await transaction(async ({ query: q }) => {
    const linhas = await q(
      `SELECT ID, FORMULA FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA WITH (UPDLOCK, HOLDLOCK)
        WHERE VISAO_ID = @visao`,
      { visao: visaoId }
    );
    const dependente = linhas.find(
      (linha) =>
        linha.ID !== linhaId &&
        linha.FORMULA &&
        referenciasDaFormula(linha.FORMULA).some(
          (referencia) => referencia.prefixo === "L" && referencia.codigo === linhaId
        )
    );
    if (dependente) {
      const erro = new Error(
        `A linha ${linhaId} não pode ser excluída porque é usada pela fórmula de ${dependente.ID}.`
      );
      erro.status = 409;
      throw erro;
    }
    await q(
      `DELETE FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA WHERE VISAO_ID = @visao AND ID = @id`,
      { visao: visaoId, id: linhaId }
    );
  });
}

// `ordem` = [{id, ordem}], a lista inteira reordenada de uma vez — arrastar
// uma linha desloca todas as outras, e gravar item a item deixaria a ordem
// inconsistente se a rede caísse no meio.
export async function reordenarLinhasDre(visaoId, ordem) {
  await transaction(async ({ query: q }) => {
    const itens = ordem ?? [];
    const existentes = await q(
      `SELECT ID FROM dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA WITH (UPDLOCK, HOLDLOCK)
        WHERE VISAO_ID = @visao`,
      { visao: visaoId }
    );
    const recebidos = new Set(itens.map((item) => item.id));
    if (
      recebidos.size !== itens.length ||
      existentes.length !== itens.length ||
      existentes.some((linha) => !recebidos.has(linha.ID))
    ) {
      const erro = new Error("A ordem precisa conter cada linha atual do DRE exatamente uma vez.");
      erro.status = 409;
      throw erro;
    }
    for (const item of itens) {
      await q(
        `UPDATE dbo.KING_PORTAL_ORC_VISAO_DRE_LINHA SET ORDEM = @ordem
          WHERE VISAO_ID = @visao AND ID = @id`,
        { visao: visaoId, id: item.id, ordem: item.ordem }
      );
    }
  });
}

// --------------------------------------------------------------------------
// Plano
// --------------------------------------------------------------------------

async function salvarPlanoCom(q, entrada, login, { comPublicacao = false, comFuncionarios = false } = {}) {
  const { id, nome, ano, visaoId } = entrada;
  const plano = validarPlano({ id, nome, ano, visaoId });
  const [atual] = await q(
      `SELECT ID, ANO, VISAO_ID${comPublicacao ? ", ID_ORCAMENTO" : ""}
         FROM dbo.KING_PORTAL_ORC_PLANO WITH (UPDLOCK, HOLDLOCK)
        WHERE ID = @id`,
      { id: plano.id }
    );

  if (atual) {
    const mudouEstrutura =
      Number(atual.ANO) !== plano.ano || (atual.VISAO_ID ?? null) !== plano.visaoId;
    if (mudouEstrutura && atual.ID_ORCAMENTO) {
        const erro = new Error(
          "Ano e visão não podem mudar depois que o plano foi vinculado a um orçamento no Linx."
        );
        erro.status = 409;
        throw erro;
    }

    if (mudouEstrutura) {
      const [comDados] = await q(
        `SELECT TOP 1 1 AS tem
           WHERE EXISTS (
             SELECT 1 FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE PLANO_ID = @id
           )${
             comFuncionarios
               ? ` OR EXISTS (
                    SELECT 1 FROM dbo.KING_PORTAL_ORC_FUNCIONARIO WHERE PLANO_ID = @id
                  )`
               : ""
           }`,
        { id: plano.id }
      );
      if (comDados) {
        const erro = new Error(
          "Ano e visão não podem mudar depois que o plano possui lançamentos. Duplique o plano para preservar o histórico."
        );
        erro.status = 409;
        throw erro;
      }
    }

    await q(
        `UPDATE dbo.KING_PORTAL_ORC_PLANO
            SET NOME = @nome, ANO = @ano, VISAO_ID = @visao
          WHERE ID = @id`,
        { id: plano.id, nome: plano.nome, ano: plano.ano, visao: plano.visaoId }
      );
    return plano;
  }

  await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_PLANO (ID, NOME, ANO, VISAO_ID, CRIADO_POR)
       VALUES (@id, @nome, @ano, @visao, @por)`,
      {
        id: plano.id,
        nome: plano.nome,
        ano: plano.ano,
        visao: plano.visaoId,
        por: login ?? null,
      }
    );
  return plano;
}

export async function salvarPlano(entrada, login) {
  const [comPublicacao, comFuncionarios] = await Promise.all([
    temPublicacao(),
    temFuncionarios(),
  ]);
  await transaction(async ({ query: q }) => {
    await salvarPlanoCom(q, entrada, login, { comPublicacao, comFuncionarios });
  });
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
  return transaction(async ({ query: q }) => {
    const [origem] = await q(
      `SELECT ID, VISAO_ID, ANO
         FROM dbo.KING_PORTAL_ORC_PLANO WITH (HOLDLOCK)
        WHERE ID = @id`,
      { id }
    );

    if (!origem) {
      const erro = new Error("Plano de origem não encontrado.");
      erro.status = 404;
      throw erro;
    }

    const novo = validarPlano({
      id: novoId,
      nome,
      ano: ano ?? origem.ANO,
      visaoId: origem.VISAO_ID,
    });

    await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_PLANO (ID, NOME, ANO, VISAO_ID, CRIADO_POR)
       VALUES (@novo, @nome, @ano, @visao, @por)`,
      {
        novo: novo.id,
        nome: novo.nome,
        ano: novo.ano,
        visao: novo.visaoId,
        por: login ?? null,
      }
    );

    // Uma instrução só: copiar linha a linha seriam centenas de idas ao banco
    // para uma operação que o servidor resolve sozinho.
    await q(
      `INSERT INTO dbo.KING_PORTAL_ORC_PLANEJADO
         (PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR, ALTERADO_POR)
       SELECT @novo, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES, VALOR, @por
         FROM dbo.KING_PORTAL_ORC_PLANEJADO
        WHERE PLANO_ID = @id`,
      { novo: novo.id, id, por: login ?? null }
    );

    // A quantidade de funcionários vai junto: um "2026 ajustado" que voltasse
    // com os centros vazios de gente faria a pessoa redigitar 384 números.
    if (await temFuncionarios()) {
      await q(
        `INSERT INTO dbo.KING_PORTAL_ORC_FUNCIONARIO
           (PLANO_ID, COD_FILIAL, CENTRO_CUSTO, MES, QUANTIDADE, ALTERADO_POR)
         SELECT @novo, COD_FILIAL, CENTRO_CUSTO, MES, QUANTIDADE, @por
           FROM dbo.KING_PORTAL_ORC_FUNCIONARIO
          WHERE PLANO_ID = @id`,
        { novo: novo.id, id, por: login ?? null }
      );
    }

    const [{ celulas }] = await q(
      "SELECT COUNT(*) AS celulas FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE PLANO_ID = @id",
      { id: novo.id }
    );
    return { id: novo.id, celulas };
  });
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

    const [plano] = await q("SELECT ID_ORCAMENTO FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @id", {
      id,
    });
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
  const [comFuncionarios, comPublicacao] = await Promise.all([temFuncionarios(), temPublicacao()]);
  await transaction(async ({ query: q }) => {
    const [plano] = await q(
      `SELECT ID${comPublicacao ? ", ID_ORCAMENTO" : ""}
         FROM dbo.KING_PORTAL_ORC_PLANO WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id`,
      { id }
    );
    if (!plano) return;
    const [comDados] = await q(
      `SELECT TOP 1 1 AS tem
         WHERE EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_PLANEJADO WHERE PLANO_ID = @id)${
           comFuncionarios
             ? " OR EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_FUNCIONARIO WHERE PLANO_ID = @id)"
             : ""
         }`,
      { id }
    );
    if (comDados || plano.ID_ORCAMENTO) {
      const erro = new Error(
        "Este plano possui lançamentos ou vínculo com o Linx. Desative-o para preservar o histórico."
      );
      erro.status = 409;
      throw erro;
    }
    await q("DELETE FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @id", { id });
  });
}

// Grava um lote de células. É lote porque a tela preenche até doze meses de uma
// vez (arrastar a alça, Ctrl+Enter) e mandar doze requisições daria doze
// oportunidades de gravar metade.
//
// Valor zero APAGA a linha: célula sem valor digitado é zero por definição, e
// guardar zero encheria a tabela de nada.
async function gravarPlanejadoCom(q, planoId, celulas, login, { comSituacao = false } = {}) {
  const [plano] = await q(
      `SELECT ID, VISAO_ID${comSituacao ? ", SITUACAO" : ""}
         FROM dbo.KING_PORTAL_ORC_PLANO WITH (UPDLOCK, HOLDLOCK)
        WHERE ID = @plano`,
      { plano: planoId }
    );
  exigirPlanoAtivo(plano);

  const mapeamentos = indexarMapeamentos(
      await q(
        `SELECT MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO
           FROM dbo.KING_PORTAL_ORC_VISAO_CONTA
          WHERE VISAO_ID = @visao`,
        { visao: plano.VISAO_ID }
      )
    );
  const validadas = validarCelulasPlanejadas(celulas, mapeamentos);

  for (const celula of validadas) {
      const alvo = {
        plano: planoId,
        modulo: celula.modulo,
        filial: celula.filial,
        centro: celula.centro ?? SEM_CENTRO,
        conta: celula.conta,
        receita: celula.receita ?? SEM_CENTRO,
        mes: celula.mes,
      };

      if (celula.valor === 0) {
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
}

export async function gravarPlanejado(planoId, celulas, login) {
  const comSituacao = await temSituacao();
  await transaction(async ({ query: q }) => {
    await gravarPlanejadoCom(q, planoId, celulas, login, { comSituacao });
  });
}

// --------------------------------------------------------------------------
// Quantidade de funcionários
//
// Mesmo desenho de `gravarPlanejado`: MERGE por célula, e apagar em vez de
// gravar quando o campo fica vazio.
//
// A diferença está no zero. No planejado, zero e vazio são a mesma coisa — não
// há o que orçar. Aqui zero é uma afirmação: o centro existe e não tem ninguém
// neste mês. Só `null` (campo limpo) apaga a linha.
// --------------------------------------------------------------------------

async function gravarFuncionariosCom(q, planoId, celulas, login, { comSituacao = false } = {}) {
  const [plano] = await q(
    `SELECT ID, VISAO_ID${comSituacao ? ", SITUACAO" : ""}
       FROM dbo.KING_PORTAL_ORC_PLANO WITH (UPDLOCK, HOLDLOCK)
      WHERE ID = @plano`,
    { plano: planoId }
  );
  exigirPlanoAtivo(plano);

  const centrosPermitidos = new Set(
    (
      await q(
        `SELECT COD_FILIAL, CENTRO_CUSTO
           FROM dbo.KING_PORTAL_ORC_VISAO_CENTRO
          WHERE VISAO_ID = @visao AND MODULO = 'despesas-pessoal'`,
        { visao: plano.VISAO_ID }
      )
    ).map((linha) => `${linha.COD_FILIAL}|${linha.CENTRO_CUSTO}`)
  );
  const validadas = validarCelulasDeFuncionarios(celulas, centrosPermitidos);

  for (const celula of validadas) {
    const alvo = {
      plano: planoId,
      filial: celula.filial,
      centro: celula.centro ?? SEM_CENTRO,
      mes: celula.mes,
    };

    const quantidade = celula.quantidade;
    if (quantidade == null) {
      await q(
        `DELETE FROM dbo.KING_PORTAL_ORC_FUNCIONARIO
          WHERE PLANO_ID = @plano AND COD_FILIAL = @filial
            AND CENTRO_CUSTO = @centro AND MES = @mes`,
        alvo
      );
      continue;
    }

    await q(
      `MERGE dbo.KING_PORTAL_ORC_FUNCIONARIO AS destino
       USING (SELECT @plano AS PLANO_ID, @filial AS COD_FILIAL,
                     @centro AS CENTRO_CUSTO, @mes AS MES) AS origem
          ON destino.PLANO_ID = origem.PLANO_ID AND destino.COD_FILIAL = origem.COD_FILIAL
         AND destino.CENTRO_CUSTO = origem.CENTRO_CUSTO AND destino.MES = origem.MES
       WHEN MATCHED THEN UPDATE SET
         QUANTIDADE = @quantidade, ALTERADO_EM = SYSUTCDATETIME(), ALTERADO_POR = @por
       WHEN NOT MATCHED THEN INSERT
         (PLANO_ID, COD_FILIAL, CENTRO_CUSTO, MES, QUANTIDADE, ALTERADO_POR)
         VALUES (@plano, @filial, @centro, @mes, @quantidade, @por);`,
      { ...alvo, quantidade, por: login ?? null }
    );
  }
}

export async function gravarFuncionarios(planoId, celulas, login) {
  if (!(await temFuncionarios())) {
    const erro = new Error(
      "A tabela KING_PORTAL_ORC_FUNCIONARIO não existe neste banco — rode o sql/009."
    );
    erro.status = 503;
    throw erro;
  }

  const comSituacao = await temSituacao();

  await transaction(async ({ query: q }) => {
    await gravarFuncionariosCom(q, planoId, celulas, login, { comSituacao });
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

export async function importar(estado, login, catalogos = {}) {
  if (!estado || typeof estado !== "object" || Array.isArray(estado)) {
    const erro = new Error("Estado legado inválido.");
    erro.status = 400;
    throw erro;
  }
  if (!Array.isArray(estado.visoes) || !Array.isArray(estado.planos)) {
    const erro = new Error("O estado legado precisa conter listas de visões e planos.");
    erro.status = 400;
    throw erro;
  }
  if (estado.visoes.length > 100 || estado.planos.length > 100) {
    const erro = new Error("O estado legado excede o limite de 100 visões ou planos.");
    erro.status = 413;
    throw erro;
  }

  const visoes = estado.visoes.map(validarVisao);
  const planos = estado.planos.map(validarPlano);
  const idsDeVisao = new Set(visoes.map((visao) => visao.id));
  if (idsDeVisao.size !== visoes.length || new Set(planos.map((plano) => plano.id)).size !== planos.length) {
    const erro = new Error("O estado legado contém identificadores duplicados.");
    erro.status = 400;
    throw erro;
  }
  for (const plano of planos) {
    if (plano.visaoId && !idsDeVisao.has(plano.visaoId)) {
      const erro = new Error(`O plano ${plano.id} referencia uma visão que não está na importação.`);
      erro.status = 409;
      throw erro;
    }
  }

  const visoesContabeis = new Set(
    (catalogos.visoesContabeis ?? []).map((item) => String(item.id ?? item.codigo))
  );
  for (const visao of visoes) {
    if (visoesContabeis.size && !visoesContabeis.has(visao.visaoContabil)) {
      const erro = new Error(`A visão contábil ${visao.visaoContabil} não existe no ERP.`);
      erro.status = 409;
      throw erro;
    }
  }

  const filiaisAtivasImportadas =
    estado.configuracao?.filiaisAtivas === undefined
      ? undefined
      : validarFiliaisAtivas(estado.configuracao.filiaisAtivas, catalogos.filiais);

  const mapeamentosPorVisao = new Map();
  for (let indice = 0; indice < visoes.length; indice += 1) {
    const visao = visoes[indice];
    const original = estado.visoes[indice];
    const contas = catalogos.contasPorVisao?.get(visao.visaoContabil) ?? [];
    const validados = [];
    for (const [moduloId, modulo] of Object.entries(original.modulos ?? {})) {
      if (!ehModulo(moduloId) || !modulo || typeof modulo !== "object" || Array.isArray(modulo)) {
        const erro = new Error(`Módulo inválido na visão ${visao.id}.`);
        erro.status = 400;
        throw erro;
      }
      for (const [filialId, daFilial] of Object.entries(modulo.filiais ?? {})) {
        for (const [centroId, doCentro] of Object.entries(daFilial?.centros ?? {})) {
          const validada = validarAlteracaoModulo(
            moduloId,
            { filial: filialId, centro: centroId, contas: doCentro },
            { filiais: catalogos.filiais, centros: catalogos.centros, contas }
          );
          validados.push({ modulo: moduloId, ...validada });
        }
      }
    }
    validarExclusividadeDeMapeamentos(validados);
    mapeamentosPorVisao.set(visao.id, validados);
  }

  const [comFuncionarios, comFormulas, comDre, comUnidade, comSinalConta, comPublicacao, comSituacao] =
    await Promise.all([
      temFuncionarios(),
      temFormulas(),
      temDre(),
      temUnidadeDre(),
      temSinalContaDre(),
      temPublicacao(),
      temSituacao(),
    ]);

  const resumo = await transaction(async ({ query: q }) => {
    // A checagem que decide se a importação pode acontecer está no mesmo lock
    // das gravações. Duas abas que tentem importar ao mesmo tempo não passam
    // juntas nem deixam metade do legado no banco.
    const [ocupado] = await q(
      `SELECT TOP 1 1 AS tem
         WHERE EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_VISAO WITH (UPDLOCK, HOLDLOCK))
            OR EXISTS (SELECT 1 FROM dbo.KING_PORTAL_ORC_PLANO WITH (UPDLOCK, HOLDLOCK))`
    );
    if (ocupado) {
      const erro = new Error("Já existem visões ou planos no banco — a importação só vale uma vez.");
      erro.status = 409;
      throw erro;
    }

    if (filiaisAtivasImportadas !== undefined) {
      await salvarConfiguracaoCom(q, "filiaisAtivas", filiaisAtivasImportadas, login);
    }

    for (let indice = 0; indice < visoes.length; indice += 1) {
      const visao = visoes[indice];
      const original = estado.visoes[indice];
      const contasDaVisao = catalogos.contasPorVisao?.get(visao.visaoContabil) ?? [];
      await salvarVisaoCom(q, visao, login, { comFuncionarios, comFormulas, comDre });

      for (const [moduloId, modulo] of Object.entries(original.modulos ?? {})) {
        if (!ehModulo(moduloId) || !modulo || typeof modulo !== "object" || Array.isArray(modulo)) {
          const erro = new Error(`Módulo inválido na visão ${visao.id}.`);
          erro.status = 400;
          throw erro;
        }
        await marcarModuloCom(q, visao.id, moduloId);

        for (const [conta, tipo] of Object.entries(modulo.sinais ?? {})) {
          const validada = validarAlteracaoModulo(
            moduloId,
            { sinal: { conta, tipo } },
            { filiais: catalogos.filiais, centros: catalogos.centros, contas: contasDaVisao }
          );
          await definirSinalCom(q, visao.id, moduloId, validada.sinal.conta, validada.sinal.tipo);
        }
        for (const [conta, formula] of Object.entries(modulo.formulas ?? {})) {
          const expressao = String(formula?.expressao ?? "").trim();
          if (!comFormulas) {
            const erro = new Error(
              "O banco ainda não possui a migração de fórmulas necessária para importar este legado."
            );
            erro.status = 503;
            throw erro;
          }
          const validada = validarAlteracaoModulo(
            moduloId,
            { formula: { conta, expressao } },
            { filiais: catalogos.filiais, centros: catalogos.centros, contas: contasDaVisao }
          );
          if (!validada.formula.expressao) {
            const erro = new Error(`Fórmula inválida para a conta ${conta}: expressão vazia.`);
            erro.status = 400;
            throw erro;
          }
          await definirFormulaCom(
            q,
            visao.id,
            moduloId,
            validada.formula.conta,
            validada.formula.expressao,
            login
          );
        }

        for (const item of (mapeamentosPorVisao.get(visao.id) ?? []).filter(
          (mapeamento) => mapeamento.modulo === moduloId
        )) {
          await definirUsoDoCentroCom(q, visao.id, moduloId, item.filial, item.centro, true);
          await definirContasCom(q, visao.id, moduloId, item.filial, item.centro, item.contas);
        }
      }

      const linhasDre = original.dreLinhas ?? [];
      if (!Array.isArray(linhasDre)) {
        const erro = new Error(`Linhas do DRE inválidas na visão ${visao.id}.`);
        erro.status = 400;
        throw erro;
      }
      if (linhasDre.length && !comDre) {
        const erro = new Error("O banco ainda não possui a migração do DRE necessária para importar este legado.");
        erro.status = 503;
        throw erro;
      }
      for (const linhaOriginal of linhasDre) {
        const linha = validarLinhaDre(linhaOriginal, { linhas: linhasDre, contas: contasDaVisao });
        await salvarLinhaDreCom(q, visao.id, linha, login, { comUnidade, comSinalConta });
      }
    }

    let totalCelulas = 0;
    let totalFuncionarios = 0;
    for (let indice = 0; indice < planos.length; indice += 1) {
      const plano = planos[indice];
      const original = estado.planos[indice];
      await salvarPlanoCom(q, plano, login, { comPublicacao, comFuncionarios });

      const celulas = Object.entries(original.planejado ?? {}).map(([chave, valor]) => {
        const [modulo, filial, centro, conta, mes, receita] = chave.split("|");
        return { modulo, filial, centro, conta, receita: receita ?? "", mes: Number(mes), valor };
      });
      for (let inicio = 0; inicio < celulas.length; inicio += 200) {
        await gravarPlanejadoCom(q, plano.id, celulas.slice(inicio, inicio + 200), login, {
          comSituacao,
        });
      }
      totalCelulas += celulas.length;

      const funcionarios = Object.entries(original.funcionarios ?? {}).map(([chave, quantidade]) => {
        const [filial, centro, mes] = chave.split("|");
        return { filial, centro, mes: Number(mes), quantidade };
      });
      if (funcionarios.length && !comFuncionarios) {
        const erro = new Error(
          "O banco ainda não possui a migração de funcionários necessária para importar este legado."
        );
        erro.status = 503;
        throw erro;
      }
      for (let inicio = 0; inicio < funcionarios.length; inicio += 200) {
        await gravarFuncionariosCom(q, plano.id, funcionarios.slice(inicio, inicio + 200), login, {
          comSituacao,
        });
      }
      totalFuncionarios += funcionarios.length;

      if (comSituacao && original.situacao === "inativo") {
        await q(
          `UPDATE dbo.KING_PORTAL_ORC_PLANO
              SET SITUACAO = 'inativo', SITUACAO_EM = SYSUTCDATETIME(), SITUACAO_POR = @por
            WHERE ID = @id`,
          { id: plano.id, por: login ?? null }
        );
      }
    }

    return { visoes: visoes.length, planos: planos.length, celulas: totalCelulas, funcionarios: totalFuncionarios };
  });

  return {
    ...resumo,
    celulas: (estado?.planos ?? []).reduce(
      (total, plano) => total + Object.keys(plano.planejado ?? {}).length,
      0
    ),
  };
}

// Filial que sai do ERP deixa edições órfãs em todos os planos.
export async function purgarFilial(filialId) {
  const tabelas = [
    "dbo.KING_PORTAL_ORC_PLANEJADO",
    "dbo.KING_PORTAL_ORC_VISAO_CONTA",
    "dbo.KING_PORTAL_ORC_VISAO_CENTRO",
  ];
  // Deixar a quantidade para trás guardaria pessoas numa filial que o portal
  // não conhece mais.
  if (await temFuncionarios()) tabelas.push("dbo.KING_PORTAL_ORC_FUNCIONARIO");

  await transaction(async ({ query: q }) => {
    for (const tabela of tabelas) {
      await q(`DELETE FROM ${tabela} WHERE COD_FILIAL = @filial`, { filial: filialId });
    }
  });
}
