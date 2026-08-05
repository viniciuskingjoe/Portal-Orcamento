// ============================================================================
// IMPORTAR O PLANEJADO DO SCOREPLAN
//
// Lê os CSV exportados do Scoreplan e carrega o planejado num plano do portal:
// configura a visão (filiais, centros e contas de cada módulo) e grava os
// valores mês a mês.
//
// O SCOREPLAN INVERTE OS NOMES em relação ao Linx, e é o detalhe que faz tudo
// cair no lugar errado se for feito à mão:
//
//   "Cod. Int. Unidade"  (001, 002, 017…)  →  CENTRO DE CUSTO do Linx
//   "Centro de Custo"    (MATRIZ, FILIAL)  →  FILIAL
//
// E quando a unidade não é da empresa 1, o Scoreplan PREFIXA o centro com o
// número da empresa: "6020" é a empresa 6 (MEN HUB) no centro 020, não um
// centro "6020" — todo centro do Linx tem exatamente 3 dígitos. Confirmado no
// razão: a filial 000025 tem 19.966 lançamentos no centro 020.
//
// A conta vem sem pontos ("31101001") e vira a classificação "3.1.1.01.001"
// nos cortes 1-1-1-2-3.
//
// Uso:
//   node --env-file=.env scripts/importar-scoreplan.mjs <pasta>            (só confere)
//   node --env-file=.env scripts/importar-scoreplan.mjs <pasta> --gravar --plano <id>
// ============================================================================

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { query, transaction } from "../server/sqlserver.js";

const MATRIZ = "000001";
const FILIAL = "000011";

// Cada arquivo do Scoreplan alimenta um módulo do portal. `conta` e `receita`
// nomeiam a coluna "Cod. Int. …" de onde sai cada dimensão — os rótulos mudam
// de arquivo para arquivo ("Custo Variavel", "Deducao de Vendas", "Conta"…).
//
// `percentual` segue a definição do módulo no portal: nesses, o valor é um
// percentual sobre uma receita, e a receita é parte da chave. Nos demais a
// receita não existe como dimensão, então as linhas que só diferem nela são
// somadas — senão duas linhas do CSV colidiriam na mesma célula.
const PERFIS = [
  { arquivo: "receita de vendas", modulo: "receita-vendas", conta: "Produto/Serviço" },
  {
    arquivo: "custos variáveis",
    modulo: "custos-variaveis",
    conta: "Custo Variavel",
    receita: "Produto/Serviço",
    percentual: true,
  },
  {
    arquivo: "dedução de vendas",
    modulo: "deducoes-vendas",
    conta: "Deducao de Vendas",
    receita: "Produto/Serviço",
    percentual: true,
  },
  { arquivo: "despesas variáveis", modulo: "despesas-variaveis", conta: "Despesa Variável" },
  { arquivo: "despesas operacionais", modulo: "despesas-operacionais", conta: "Conta" },
  { arquivo: "outras despesas", modulo: "outras-despesas", conta: "Outra Conta" },
  {
    arquivo: "receitas não operacionais",
    modulo: "receitas-nao-operacionais",
    conta: "Outra Receita",
  },
];

// Acento e caixa não são confiáveis em nome de arquivo baixado do navegador.
const semAcento = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase();

function perfilDoArquivo(nome) {
  const alvo = semAcento(nome);
  return PERFIS.find((perfil) => alvo.includes(semAcento(perfil.arquivo))) ?? null;
}

// "31101001" → "3.1.1.01.001". O Linx corta em 1-1-1-2-3; qualquer outro
// tamanho não é conta e é melhor recusar do que gravar lixo.
function classificacao(codigo) {
  const digitos = String(codigo ?? "").trim();
  if (!/^\d{8}$/u.test(digitos)) return null;
  return [
    digitos.slice(0, 1),
    digitos.slice(1, 2),
    digitos.slice(2, 3),
    digitos.slice(3, 5),
    digitos.slice(5, 8),
  ].join(".");
}

// pt-BR: vírgula decimal e, às vezes, sem o zero à esquerda (",07" = 0,07).
// Célula vazia é ausência de valor, e não zero — o Scoreplan usa as duas coisas
// com sentidos diferentes.
function numero(texto) {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return null;
  const valor = Number(bruto.replace(/\./gu, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function linhasDoCsv(conteudo) {
  const limpo = conteudo.replace(/^﻿/u, "");
  const linhas = limpo.split(/\r?\n/u).filter((linha) => linha.trim().length > 0);
  if (!linhas.length) return { cabecalho: [], registros: [] };

  const cabecalho = linhas[0].split(";").map((celula) => celula.trim());
  const registros = linhas.slice(1).map((linha) => {
    const celulas = linha.split(";");
    return Object.fromEntries(cabecalho.map((coluna, i) => [coluna, celulas[i] ?? ""]));
  });
  return { cabecalho, registros };
}

// Todo centro do Linx tem 3 dígitos. Quando o Scoreplan traz 4, o primeiro é a
// empresa da unidade — é assim que "020 E-COMMERCE" aparece duas vezes, uma na
// KING&JOE (020) e outra na MEN HUB (6020).
function unidadeDaLinha(linha) {
  const codigo = String(linha["Cod. Int. Unidade"] ?? "").trim();
  if (/^\d{4}$/u.test(codigo)) return { empresa: Number(codigo[0]), centro: codigo.slice(1) };
  return { empresa: 1, centro: codigo };
}

// A filial não tem uma coluna só. Fora da empresa 1 ela é a própria empresa
// (MEN HUB só tem uma filial). Dentro da 1, quem decide é a coluna "Centro de
// Custo" — que, apesar do nome, traz MATRIZ ou FILIAL.
function filialDaLinha(linha, empresa, filialPorEmpresa) {
  if (empresa !== 1) {
    const daEmpresa = filialPorEmpresa.get(empresa);
    if (daEmpresa) return daEmpresa;
  }

  const rotulo = String(linha["Centro de Custo"] ?? "").trim().toUpperCase();
  if (rotulo === "FILIAL") return FILIAL;
  return MATRIZ;
}

// Colunas de mês: "Receita Planejado - 01/2026", "Valor Total Planejado - …",
// "Percentual Planejado - …". O prefixo muda por arquivo; o que não muda é
// terminar em "Planejado - MM/AAAA".
function colunasDeMes(cabecalho, ano) {
  const mapa = new Map();
  for (const coluna of cabecalho) {
    const achado = /Planejado\s*-\s*(\d{2})\/(\d{4})$/u.exec(coluna);
    if (!achado) continue;
    if (Number(achado[2]) !== ano) continue;
    mapa.set(Number(achado[1]), coluna);
  }
  return mapa;
}

// Empresa → filial. Só serve para as empresas que têm uma filial só; a 1 tem
// muitas, e lá quem decide é a coluna MATRIZ/FILIAL.
async function filiaisPorEmpresa() {
  const linhas = await query(
    `SELECT EMPRESA, MIN(RTRIM(COD_FILIAL)) AS filial, COUNT(*) AS quantas
       FROM dbo.FILIAIS GROUP BY EMPRESA`
  );
  const mapa = new Map();
  for (const linha of linhas) {
    if (linha.quantas === 1) mapa.set(linha.EMPRESA, linha.filial);
  }
  return mapa;
}

async function lerPasta(pasta, ano) {
  const filialPorEmpresa = await filiaisPorEmpresa();
  const arquivos = (await readdir(pasta)).filter((nome) => nome.toLowerCase().endsWith(".csv"));
  const celulas = new Map();
  const relatorio = [];
  const semPerfil = [];

  for (const arquivo of arquivos) {
    const perfil = perfilDoArquivo(arquivo);
    if (!perfil) {
      semPerfil.push(arquivo);
      continue;
    }

    const conteudo = await readFile(path.join(pasta, arquivo), "utf8");
    const { cabecalho, registros } = linhasDoCsv(conteudo);
    const meses = colunasDeMes(cabecalho, ano);

    const contaColuna = `Cod. Int. ${perfil.conta}`;
    const receitaColuna = perfil.receita ? `Cod. Int. ${perfil.receita}` : null;
    const resumo = {
      arquivo,
      modulo: perfil.modulo,
      linhas: registros.length,
      valores: 0,
      contasInvalidas: new Set(),
      centros: new Set(),
      contas: new Set(),
    };

    for (const linha of registros) {
      const { empresa, centro } = unidadeDaLinha(linha);
      const conta = classificacao(linha[contaColuna]);
      if (!conta) {
        if (String(linha[contaColuna] ?? "").trim()) {
          resumo.contasInvalidas.add(String(linha[contaColuna]).trim());
        }
        continue;
      }

      const filial = filialDaLinha(linha, empresa, filialPorEmpresa);
      const receita = perfil.percentual ? (classificacao(linha[receitaColuna]) ?? "") : "";

      for (const [mes, coluna] of meses) {
        const valor = numero(linha[coluna]);
        if (valor === null) continue;

        const chave = [perfil.modulo, filial, centro, conta, receita, mes].join("|");
        // Soma: nos módulos sem receita como dimensão, várias linhas do CSV
        // (uma por produto) caem na mesma célula do portal.
        celulas.set(chave, (celulas.get(chave) ?? 0) + valor);
        resumo.valores += 1;
        resumo.centros.add(centro);
        resumo.contas.add(conta);
      }
    }

    relatorio.push(resumo);
  }

  return { celulas, relatorio, semPerfil };
}

async function conferirCadastros(celulas) {
  const centros = new Set();
  const contas = new Set();
  for (const chave of celulas.keys()) {
    const [, , centro, conta] = chave.split("|");
    centros.add(centro);
    contas.add(conta);
  }

  const doErp = await query(
    "SELECT RTRIM(CENTRO_CUSTO) AS id FROM dbo.CTB_CENTRO_CUSTO WHERE ISNULL(INATIVA, 0) = 0"
  );
  const conhecidos = new Set(doErp.map((linha) => linha.id));

  return {
    centrosDesconhecidos: [...centros].filter((centro) => !conhecidos.has(centro)).sort(),
    totalCentros: centros.size,
    totalContas: contas.size,
  };
}

async function gravar(planoId, celulas, login) {
  const plano = await query(
    "SELECT ID, NOME, ANO, VISAO_ID FROM dbo.KING_PORTAL_ORC_PLANO WHERE ID = @id",
    { id: planoId }
  );
  if (!plano.length) throw new Error(`Plano ${planoId} não existe.`);
  const { VISAO_ID: visaoId, ANO: ano } = plano[0];
  if (!visaoId) throw new Error(`O plano ${planoId} não tem visão associada.`);

  const registros = [...celulas.entries()].map(([chave, valor]) => {
    const [modulo, filial, centro, conta, receita, mes] = chave.split("|");
    return { modulo, filial, centro, conta, receita, mes: Number(mes), valor };
  });

  await transaction(async ({ query: q }) => {
    // A visão precisa conhecer a combinação antes de o valor aparecer na tela:
    // o portal só desenha filial × centro × conta que a visão configurou.
    const modulos = new Set(registros.map((r) => r.modulo));
    for (const modulo of modulos) {
      await q(
        `MERGE dbo.KING_PORTAL_ORC_VISAO_MODULO AS d
         USING (SELECT @visao AS VISAO_ID, @modulo AS MODULO) AS o
            ON d.VISAO_ID = o.VISAO_ID AND d.MODULO = o.MODULO
         WHEN NOT MATCHED THEN INSERT (VISAO_ID, MODULO, USA_CENTRO) VALUES (@visao, @modulo, 1);`,
        { visao: visaoId, modulo }
      );
    }

    const centros = new Set(registros.map((r) => [r.modulo, r.filial, r.centro].join("|")));
    for (const chave of centros) {
      const [modulo, filial, centro] = chave.split("|");
      await q(
        `MERGE dbo.KING_PORTAL_ORC_VISAO_CENTRO AS d
         USING (SELECT @visao AS VISAO_ID, @modulo AS MODULO, @filial AS COD_FILIAL,
                       @centro AS CENTRO_CUSTO) AS o
            ON d.VISAO_ID = o.VISAO_ID AND d.MODULO = o.MODULO
           AND d.COD_FILIAL = o.COD_FILIAL AND d.CENTRO_CUSTO = o.CENTRO_CUSTO
         WHEN NOT MATCHED THEN INSERT (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO)
           VALUES (@visao, @modulo, @filial, @centro);`,
        { visao: visaoId, modulo, filial, centro }
      );
    }

    const contas = new Set(
      registros.map((r) => [r.modulo, r.filial, r.centro, r.conta].join("|"))
    );
    for (const chave of contas) {
      const [modulo, filial, centro, conta] = chave.split("|");
      await q(
        `MERGE dbo.KING_PORTAL_ORC_VISAO_CONTA AS d
         USING (SELECT @visao AS VISAO_ID, @modulo AS MODULO, @filial AS COD_FILIAL,
                       @centro AS CENTRO_CUSTO, @conta AS CLASSIFICACAO) AS o
            ON d.VISAO_ID = o.VISAO_ID AND d.MODULO = o.MODULO
           AND d.COD_FILIAL = o.COD_FILIAL AND d.CENTRO_CUSTO = o.CENTRO_CUSTO
           AND d.CLASSIFICACAO = o.CLASSIFICACAO
         WHEN NOT MATCHED THEN
           INSERT (VISAO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO)
           VALUES (@visao, @modulo, @filial, @centro, @conta);`,
        { visao: visaoId, modulo, filial, centro, conta }
      );
    }

    for (const r of registros) {
      await q(
        `MERGE dbo.KING_PORTAL_ORC_PLANEJADO AS d
         USING (SELECT @plano AS PLANO_ID, @modulo AS MODULO, @filial AS COD_FILIAL,
                       @centro AS CENTRO_CUSTO, @conta AS CLASSIFICACAO,
                       @receita AS RECEITA, @mes AS MES) AS o
            ON d.PLANO_ID = o.PLANO_ID AND d.MODULO = o.MODULO
           AND d.COD_FILIAL = o.COD_FILIAL AND d.CENTRO_CUSTO = o.CENTRO_CUSTO
           AND d.CLASSIFICACAO = o.CLASSIFICACAO AND d.RECEITA = o.RECEITA AND d.MES = o.MES
         WHEN MATCHED THEN
           UPDATE SET VALOR = @valor, ALTERADO_EM = SYSUTCDATETIME(), ALTERADO_POR = @por
         WHEN NOT MATCHED THEN
           INSERT (PLANO_ID, MODULO, COD_FILIAL, CENTRO_CUSTO, CLASSIFICACAO, RECEITA, MES,
                   VALOR, ALTERADO_POR)
           VALUES (@plano, @modulo, @filial, @centro, @conta, @receita, @mes, @valor, @por);`,
        {
          plano: planoId,
          modulo: r.modulo,
          filial: r.filial,
          centro: r.centro,
          conta: r.conta,
          receita: r.receita,
          mes: r.mes,
          valor: r.valor,
          por: login,
        }
      );
    }
  });

  return { ano, registros: registros.length };
}

async function principal() {
  const args = process.argv.slice(2);
  const pasta = args.find((a) => !a.startsWith("--"));
  const deveGravar = args.includes("--gravar");
  const planoId = args[args.indexOf("--plano") + 1];
  const ano = Number(args[args.indexOf("--ano") + 1]) || 2026;

  if (!pasta) {
    console.error("Informe a pasta com os CSV do Scoreplan.");
    process.exit(1);
  }

  const { celulas, relatorio, semPerfil } = await lerPasta(pasta, ano);

  console.log(`\nLidos de ${pasta} (ano ${ano}):\n`);
  console.table(
    relatorio.map((r) => ({
      arquivo: r.arquivo,
      modulo: r.modulo,
      linhas: r.linhas,
      valores: r.valores,
      centros: r.centros.size,
      contas: r.contas.size,
      "contas inválidas": r.contasInvalidas.size,
    }))
  );

  if (semPerfil.length) {
    console.log(`Arquivos sem módulo correspondente: ${semPerfil.join(", ")}`);
  }

  const { centrosDesconhecidos, totalCentros, totalContas } = await conferirCadastros(celulas);
  console.log(
    `\nCélulas a gravar: ${celulas.size} | centros: ${totalCentros} | contas: ${totalContas}`
  );
  if (centrosDesconhecidos.length) {
    console.log(
      `ATENÇÃO — centros que não existem (ou estão inativos) no ERP: ${centrosDesconhecidos.join(", ")}`
    );
  }

  if (!deveGravar) {
    console.log("\nConferência apenas. Para gravar: --gravar --plano <id>\n");
    process.exit(0);
  }

  if (!planoId) {
    console.error("\n--gravar exige --plano <id>.");
    process.exit(1);
  }

  const { registros } = await gravar(planoId, celulas, "importacao-scoreplan");
  console.log(`\nGravadas ${registros} células no plano ${planoId}.\n`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
