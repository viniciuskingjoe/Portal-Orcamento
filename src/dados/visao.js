import { MODULOS } from "./modulos.js";

// ============================================================================
// VISÃO
//
// Global (não pertence a um plano). Aponta para UMA visão contábil do Linx e,
// para cada módulo, diz quais contas o compõem — por filial, e opcionalmente por
// centro de custo.
//
//   {
//     id, nome,
//     visaoContabil: "25",
//     modulos: {
//       "receita-vendas": {
//         usaCentro: false,
//         filiais: {
//           "000025": { contas: ["3.1.1.01.001"], centros: {} }
//         }
//       },
//       "despesas-operacionais": {
//         usaCentro: true,
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
// Sem centro, `contas` é o que a filial orça. Com centro, quem manda são os
// centros e `contas` é o consolidado deles — a ordem de uso é filial → centros
// → contas de cada centro.
// ============================================================================

export const SEM_CENTRO = "";

export function criarVisao(id, nome, visaoContabil, modulos = {}) {
  return { id, nome, visaoContabil, modulos: { ...modulos } };
}

export function moduloDaVisao(visao, moduloId) {
  return visao?.modulos?.[moduloId] ?? { usaCentro: false, filiais: {} };
}

export function usaCentroDeCusto(visao, moduloId) {
  return moduloDaVisao(visao, moduloId).usaCentro === true;
}

export function definirUsaCentroDeCusto(visao, moduloId, usa) {
  const modulo = moduloDaVisao(visao, moduloId);
  return {
    ...visao,
    modulos: { ...visao.modulos, [moduloId]: { ...modulo, usaCentro: usa === true } },
  };
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

// Grava a filial mantendo a regra do consolidado: com centro, `contas` é sempre
// a união dos centros, venha a alteração de onde vier.
function gravarFilial(visao, moduloId, filialId, centros, contas) {
  const modulo = moduloDaVisao(visao, moduloId);
  const consolidado = usaCentroDeCusto(visao, moduloId)
    ? [...new Set(Object.values(centros).flat())].sort()
    : contas;

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

export function definirContasDaFilial(visao, moduloId, filialId, contas) {
  const atual = moduloDaVisao(visao, moduloId).filiais?.[filialId] ?? { centros: {} };
  const permitidas = new Set(contas);

  // Conta que sai da filial sai também dos centros dela. O centro continua em
  // uso mesmo ficando vazio — quem tira um centro do ar é `definirUsoDoCentro`.
  const centros = {};
  Object.entries(atual.centros ?? {}).forEach(([centroId, doCentro]) => {
    centros[centroId] = (doCentro ?? []).filter((codigo) => permitidas.has(codigo));
  });

  return gravarFilial(visao, moduloId, filialId, centros, [...contas]);
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

  return gravarFilial(visao, moduloId, filialId, centros, atual.contas ?? []);
}

export function definirContasDoCentro(visao, moduloId, filialId, centroId, contas) {
  const atual = moduloDaVisao(visao, moduloId).filiais?.[filialId] ?? { contas: [], centros: {} };
  const centros = { ...(atual.centros ?? {}), [centroId]: [...contas] };

  return gravarFilial(visao, moduloId, filialId, centros, atual.contas ?? []);
}

// Contas que valem para uma combinação filial × centro. Sem centro (ou módulo
// que não usa centro), são as da filial.
export function contasEfetivasDoModulo(visao, moduloId, filialId, centroId = SEM_CENTRO) {
  if (!usaCentroDeCusto(visao, moduloId) || centroId === SEM_CENTRO) {
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
