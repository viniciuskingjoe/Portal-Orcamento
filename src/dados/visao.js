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
//             contas: ["4.4.1.01.003", "4.4.1.01.004"],   // contas da filial
//             centros: { "002": ["4.4.1.01.003"] }        // subconjunto por centro
//           }
//         }
//       }
//     }
//   }
//
// As contas do centro são sempre um SUBCONJUNTO das contas da filial: primeiro
// se define o que a filial orça, depois se distribui entre os centros.
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

export function definirContasDaFilial(visao, moduloId, filialId, contas) {
  const modulo = moduloDaVisao(visao, moduloId);
  const atual = modulo.filiais?.[filialId] ?? { contas: [], centros: {} };
  const permitidas = new Set(contas);

  // Conta que sai da filial sai também dos centros dela — o centro é
  // subconjunto, e deixar sobra faria a soma do centro incluir o que a filial
  // não orça mais.
  const centros = {};
  Object.entries(atual.centros ?? {}).forEach(([centroId, doCentro]) => {
    const restante = (doCentro ?? []).filter((codigo) => permitidas.has(codigo));
    if (restante.length) centros[centroId] = restante;
  });

  return {
    ...visao,
    modulos: {
      ...visao.modulos,
      [moduloId]: {
        ...modulo,
        filiais: { ...modulo.filiais, [filialId]: { contas: [...contas], centros } },
      },
    },
  };
}

// --------------------------------------------------------------------------
// Contas por centro de custo (subconjunto das da filial)
// --------------------------------------------------------------------------

export function centrosDaFilial(visao, moduloId, filialId) {
  const centros = moduloDaVisao(visao, moduloId).filiais?.[filialId]?.centros ?? {};
  return Object.keys(centros).filter((id) => (centros[id] ?? []).length > 0);
}

export function contasDoCentro(visao, moduloId, filialId, centroId) {
  const contas = moduloDaVisao(visao, moduloId).filiais?.[filialId]?.centros?.[centroId];
  return Array.isArray(contas) ? contas : [];
}

export function definirContasDoCentro(visao, moduloId, filialId, centroId, contas) {
  const modulo = moduloDaVisao(visao, moduloId);
  const atual = modulo.filiais?.[filialId] ?? { contas: [], centros: {} };
  const daFilial = new Set(atual.contas ?? []);

  // Guarda a regra do subconjunto no modelo, não só na tela.
  const validas = contas.filter((codigo) => daFilial.has(codigo));

  return {
    ...visao,
    modulos: {
      ...visao.modulos,
      [moduloId]: {
        ...modulo,
        filiais: {
          ...modulo.filiais,
          [filialId]: { ...atual, centros: { ...atual.centros, [centroId]: validas } },
        },
      },
    },
  };
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
// Exceções de sinal
//
// O sinal de cada conta vem do LX_GRUPO_CONTABIL dela (R é receita). Algumas
// contas estão classificadas errado no ERP — 4.6.5.01 INDENIZAÇÃO DE SEGUROS e
// 4.6.5.02 OUTRAS RECEITAS são receita marcada como DF. Aqui ficam as exceções,
// por módulo.
// --------------------------------------------------------------------------

export function contasInvertidas(visao, moduloId) {
  const lista = moduloDaVisao(visao, moduloId).inverter;
  return Array.isArray(lista) ? lista : [];
}

export function definirContasInvertidas(visao, moduloId, codigos) {
  const modulo = moduloDaVisao(visao, moduloId);
  return {
    ...visao,
    modulos: { ...visao.modulos, [moduloId]: { ...modulo, inverter: [...new Set(codigos)] } },
  };
}

export function alternarInversao(visao, moduloId, codigo) {
  const atuais = new Set(contasInvertidas(visao, moduloId));
  if (atuais.has(codigo)) atuais.delete(codigo);
  else atuais.add(codigo);
  return definirContasInvertidas(visao, moduloId, [...atuais]);
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
