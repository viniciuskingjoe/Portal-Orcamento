import { MODULOS } from "./modulos.js";

// ============================================================================
// VISÃO
//
// Global (não pertence a um plano). Aponta para UMA visão contábil do Linx e,
// para cada módulo, diz quais contas o compõem — por filial e por centro de
// custo.
//
//   {
//     id, nome,
//     visaoContabil: "25",
//     modulos: {
//       "despesas-operacionais": {
//         filiais: {
//           "000001": {
//             centros: {                                  // quem manda
//               "002": ["4.4.1.01.003"],
//               "008": ["4.4.1.01.004"]
//             },
//             contas: ["4.4.1.01.003", "4.4.1.01.004"]    // união, derivada
//           }
//         }
//       }
//     }
//   }
//
// Quem manda são os centros; `contas` é o consolidado deles, guardado em vez de
// recalculado para que a tela do plano, o DRE e a base do percentual leiam a
// filial sem precisar somar centro a centro. A ordem de uso é sempre
// filial → centros → contas de cada centro.
// ============================================================================

export const SEM_CENTRO = "";

export function criarVisao(id, nome, visaoContabil, modulos = {}) {
  return { id, nome, visaoContabil, modulos: { ...modulos } };
}

export function moduloDaVisao(visao, moduloId) {
  return visao?.modulos?.[moduloId] ?? { filiais: {} };
}

// TODO módulo é orçado por centro de custo. Já foi opcional, por módulo, com um
// interruptor na tela — e o resultado era que a mesma pergunta ("de qual centro
// é esta despesa?") tinha resposta em alguns módulos e não em outros, o que
// impedia qualquer leitura por centro atravessando o DRE.
//
// A função continua existindo, em vez de as chamadas sumirem, porque é ela que
// diz POR QUE os caminhos "sem centro" ainda estão no código: o consolidado da
// filial (`SEM_CENTRO`) segue sendo um estado legítimo de leitura — é o "Total —
// todos os centros". O que deixou de existir é módulo sem a dimensão.
export function usaCentroDeCusto() {
  return true;
}

// --------------------------------------------------------------------------
// Contas por filial
// --------------------------------------------------------------------------

export function filiaisDoModulo(visao, moduloId) {
  const filiais = moduloDaVisao(visao, moduloId).filiais ?? {};
  return Object.keys(filiais).filter((id) => (filiais[id]?.contas ?? []).length > 0);
}

export function contasDaFilial(visao, moduloId, filialId) {
  const contas = moduloDaVisao(visao, moduloId).filiais?.[filialId]?.contas;
  return Array.isArray(contas) ? contas : [];
}

// Grava a filial mantendo a regra do consolidado: `contas` é SEMPRE a união dos
// centros, venha a alteração de onde vier. Quem chama não escolhe — se
// escolhesse, uma tela poderia gravar um consolidado que não corresponde aos
// centros, e o total da filial passaria a mentir.
function gravarFilial(visao, moduloId, filialId, centros) {
  const modulo = moduloDaVisao(visao, moduloId);
  const consolidado = [...new Set(Object.values(centros).flat())].sort();

  return {
    ...visao,
    modulos: {
      ...visao.modulos,
      [moduloId]: {
        ...modulo,
        filiais: { ...modulo.filiais, [filialId]: { contas: consolidado, centros } },
      },
    },
  };
}

// --------------------------------------------------------------------------
// Contas por centro de custo
//
// Em módulo com centro a ordem é filial → centros → contas: escolhe-se quais
// centros a filial usa e depois o que cada um orça. O centro é a origem das
// contas, e `contas` da filial passa a ser o CONSOLIDADO — a união dos centros.
//
// Guardar a união, em vez de calculá-la a cada leitura, mantém tudo que lê
// `contasDaFilial` funcionando sem saber que o módulo usa centro: tela do plano,
// DRE, base do percentual.
// --------------------------------------------------------------------------

// Centros que a filial usa. Um centro pode estar em uso e ainda sem contas —
// marcá-lo é o primeiro passo, escolher as contas dele é o segundo.
export function centrosDaFilial(visao, moduloId, filialId) {
  return Object.keys(moduloDaVisao(visao, moduloId).filiais?.[filialId]?.centros ?? {});
}

export function centroEmUso(visao, moduloId, filialId, centroId) {
  return centrosDaFilial(visao, moduloId, filialId).includes(centroId);
}

export function contasDoCentro(visao, moduloId, filialId, centroId) {
  const contas = moduloDaVisao(visao, moduloId).filiais?.[filialId]?.centros?.[centroId];
  return Array.isArray(contas) ? contas : [];
}

// Liga ou desliga um centro na filial. Ligado começa vazio: quem escolhe as
// contas é o passo seguinte.
export function definirUsoDoCentro(visao, moduloId, filialId, centroId, usa) {
  const atual = moduloDaVisao(visao, moduloId).filiais?.[filialId] ?? { contas: [], centros: {} };
  const centros = { ...(atual.centros ?? {}) };

  if (usa) centros[centroId] = centros[centroId] ?? [];
  else delete centros[centroId];

  return gravarFilial(visao, moduloId, filialId, centros);
}

export function definirContasDoCentro(visao, moduloId, filialId, centroId, contas) {
  const atual = moduloDaVisao(visao, moduloId).filiais?.[filialId] ?? { contas: [], centros: {} };
  const centros = { ...(atual.centros ?? {}), [centroId]: [...contas] };

  return gravarFilial(visao, moduloId, filialId, centros);
}

// --------------------------------------------------------------------------
// Exclusividade entre Despesas com pessoal e Despesas operacionais
//
// As três famílias de folha (`modulo.prefixos` de despesas-pessoal) só podem
// estar marcadas num módulo ou no outro para o mesmo centro, nunca nos dois —
// se estivessem, o DRE e a publicação para o Linx somariam a mesma conta duas
// vezes (motivo pelo qual a folha nunca migrou de Despesas operacionais).
// Despesas com pessoal só aceita essas três famílias, então qualquer conta
// marcada lá é, por definição, conta que precisa sair de Despesas
// operacionais no mesmo centro — e vice-versa.
// --------------------------------------------------------------------------

export const MODULO_PESSOAL = "despesas-pessoal";
export const MODULO_OPERACIONAIS = "despesas-operacionais";

// Grava as contas no módulo pedido e tira as mesmas contas do módulo par, no
// mesmo filial·centro. Funciona nas duas direções: marcar uma conta em
// Despesas com pessoal tira ela de Despesas operacionais, e marcá-la de volta
// em Despesas operacionais tira ela de Despesas com pessoal — sempre "mover",
// nunca "duplicar". Para qualquer módulo fora do par, é `definirContasDoCentro`
// puro, sem efeito colateral.
export function definirContasDoCentroExclusivo(visao, moduloId, filialId, centroId, contas) {
  const par =
    moduloId === MODULO_PESSOAL
      ? MODULO_OPERACIONAIS
      : moduloId === MODULO_OPERACIONAIS
        ? MODULO_PESSOAL
        : null;

  let proxima = definirContasDoCentro(visao, moduloId, filialId, centroId, contas);
  if (!par) return proxima;

  const doPar = contasDoCentro(proxima, par, filialId, centroId);
  const semSobreposicao = doPar.filter((codigo) => !contas.includes(codigo));
  if (semSobreposicao.length !== doPar.length) {
    proxima = definirContasDoCentro(proxima, par, filialId, centroId, semSobreposicao);
  }
  return proxima;
}

// Contas que valem para uma combinação filial × centro. Sem centro escolhido, é
// o consolidado da filial — o "Total — todos os centros".
export function contasEfetivasDoModulo(visao, moduloId, filialId, centroId = SEM_CENTRO) {
  if (centroId === SEM_CENTRO) {
    return contasDaFilial(visao, moduloId, filialId);
  }
  return contasDoCentro(visao, moduloId, filialId, centroId);
}

// --------------------------------------------------------------------------
// Sinal por conta
//
// O sinal sai do LX_GRUPO_CONTABIL da conta, com as correções conhecidas por
// cima (ver dados/mapeamentoPadrao.js). Aqui fica só o que o usuário definiu à
// mão, que ganha das duas camadas.
//
// Guardar o tipo, e não um "inverter", evita ambiguidade: com uma correção
// automática embaixo, "inverter" mudaria de significado conforme a correção
// existisse ou não.
// --------------------------------------------------------------------------

export function sinaisDoModulo(visao, moduloId) {
  const sinais = moduloDaVisao(visao, moduloId).sinais;
  return sinais && typeof sinais === "object" ? sinais : {};
}

export function definirSinalDaConta(visao, moduloId, codigo, tipo) {
  const modulo = moduloDaVisao(visao, moduloId);
  const sinais = { ...sinaisDoModulo(visao, moduloId) };

  // `null` volta a conta para o comportamento automático.
  if (tipo === "receita" || tipo === "despesa") sinais[codigo] = tipo;
  else delete sinais[codigo];

  return { ...visao, modulos: { ...visao.modulos, [moduloId]: { ...modulo, sinais } } };
}

// --------------------------------------------------------------------------
// Fórmula por conta (só Despesas com pessoal)
//
// Ausência de entrada é conta FIXA — digita o valor, como em qualquer outro
// módulo. Só existe entrada para conta CALCULADA, e o que se guarda é a
// própria expressão: um booleano "é calculada" ao lado dela poderia discordar
// de "tem expressão", e aí qual dos dois vale?
// --------------------------------------------------------------------------

export function formulasDoModulo(visao, moduloId) {
  const formulas = moduloDaVisao(visao, moduloId).formulas;
  return formulas && typeof formulas === "object" ? formulas : {};
}

export function formulaDaConta(visao, moduloId, codigo) {
  return formulasDoModulo(visao, moduloId)[codigo] ?? null;
}

export function contaEhCalculada(visao, moduloId, codigo) {
  return formulaDaConta(visao, moduloId, codigo) != null;
}

// `expressao` vazia ou nula volta a conta para fixa.
export function definirFormulaDaConta(visao, moduloId, codigo, expressao) {
  const modulo = moduloDaVisao(visao, moduloId);
  const formulas = { ...formulasDoModulo(visao, moduloId) };

  const texto = String(expressao ?? "").trim();
  if (texto) formulas[codigo] = { expressao: texto };
  else delete formulas[codigo];

  return { ...visao, modulos: { ...visao.modulos, [moduloId]: { ...modulo, formulas } } };
}

// --------------------------------------------------------------------------
// DRE — linhas do demonstrativo, por visão
//
// Cada linha soma um recorte de contas de UM módulo, ou é fórmula que
// referencia outras linhas (ver dados/dre.js e dados/formula.js). Mora aqui,
// e não em plano.js, pelo mesmo motivo de módulos/contas: é escolha de quem
// monta a visão, não do plano que a usa.
// --------------------------------------------------------------------------

export function dreLinhasOrdenadas(visao) {
  return [...(visao?.dreLinhas ?? [])].sort((a, b) => a.ordem - b.ordem);
}

export function dreLinha(visao, linhaId) {
  return (visao?.dreLinhas ?? []).find((linha) => linha.id === linhaId) ?? null;
}

// Cria ou substitui uma linha inteira. Quem chama monta o objeto completo
// (a tela do editor sempre tem os campos todos); atualização parcial não
// existe aqui porque a linha inteira já é o que se grava numa tacada só no
// servidor (ver `salvarLinhaDre`).
export function definirLinhaDre(visao, linha) {
  const atuais = visao.dreLinhas ?? [];
  const existe = atuais.some((item) => item.id === linha.id);
  const dreLinhas = existe
    ? atuais.map((item) => (item.id === linha.id ? linha : item))
    : [...atuais, linha];
  return { ...visao, dreLinhas };
}

export function removerLinhaDre(visao, linhaId) {
  return { ...visao, dreLinhas: (visao.dreLinhas ?? []).filter((linha) => linha.id !== linhaId) };
}

// `ordemDeIds` é a lista de ids na nova ordem (o resultado de arrastar na
// tela) — reescreve `ordem` de cada linha a partir da posição no array.
export function reordenarDreLinhas(visao, ordemDeIds) {
  const porId = new Map((visao.dreLinhas ?? []).map((linha) => [linha.id, linha]));
  const dreLinhas = ordemDeIds
    .map((id, indice) => {
      const linha = porId.get(id);
      return linha ? { ...linha, ordem: indice } : null;
    })
    .filter(Boolean);
  return { ...visao, dreLinhas };
}

// --------------------------------------------------------------------------
// Resumos
// --------------------------------------------------------------------------

export function moduloConfigurado(visao, moduloId) {
  return filiaisDoModulo(visao, moduloId).length > 0;
}

export function modulosDaVisao(visao) {
  return MODULOS.filter((item) => moduloConfigurado(visao, item.id));
}

export function resumoDoModulo(visao, moduloId) {
  const filiais = filiaisDoModulo(visao, moduloId);
  const contas = new Set();
  filiais.forEach((filialId) =>
    contasDaFilial(visao, moduloId, filialId).forEach((codigo) => contas.add(codigo))
  );
  return { filiais: filiais.length, contas: contas.size, usaCentro: usaCentroDeCusto(visao, moduloId) };
}

export function resumoDaVisao(visao) {
  const configurados = modulosDaVisao(visao);
  const filiais = new Set();
  let contas = 0;

  configurados.forEach((modulo) => {
    filiaisDoModulo(visao, modulo.id).forEach((filialId) => {
      filiais.add(filialId);
      contas += contasDaFilial(visao, modulo.id, filialId).length;
    });
  });

  return {
    modulos: configurados.length,
    totalDeModulos: MODULOS.length,
    filiais: filiais.size,
    contas,
  };
}
