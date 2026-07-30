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
