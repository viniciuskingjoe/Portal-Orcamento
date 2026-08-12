import { MODULOS } from "./modulos.js";

// ============================================================================
// TERRITÓRIO + MATRIZ
//
// Duas leituras da MESMA permissão. O banco continua guardando concessões
// soltas — isto é só uma forma de escrevê-las e de lê-las de volta.
//
//   concessão   { modulo, filial, centro, podeEditar }   como grava
//   território  onde a pessoa atua: pares filial × centro
//   matriz      o que ela faz em cada módulo: nada | ve | edita
//
// POR QUE
// Autorar concessão a concessão obriga a montar um produto cartesiano — três
// módulos, duas filiais e quatro centros viram 24 linhas — e depois a fazer a
// união de cabeça para saber o que a pessoa pode. Separando ONDE de O QUÊ, o
// território é escolhido uma vez e a matriz é lida de bate-pronto.
//
// NEM TUDO CABE
// Concessões gravadas à mão podem dar territórios diferentes por módulo ("edita
// receita no e-commerce, vê despesas da empresa toda"). Isso é legítimo e o
// modelo antigo suporta; a matriz não. `lerTerritorio` avisa com `cabe: false`
// em vez de fingir que coube e apagar metade da permissão de alguém.
// ============================================================================

export const NADA = "nada";
export const VE = "ve";
export const EDITA = "edita";

// Filial e centro nulos = todas. É o "tudo" do modelo de concessão.
export const TUDO = { filial: null, centro: null };

const chaveDoLugar = (filial, centro) => `${filial ?? ""}|${centro ?? ""}`;

function lugaresDe(acessos) {
  const lugares = new Map();
  for (const acesso of acessos) {
    const chave = chaveDoLugar(acesso.filial, acesso.centro);
    if (!lugares.has(chave)) {
      lugares.set(chave, { filial: acesso.filial ?? null, centro: acesso.centro ?? null });
    }
  }
  return [...lugares.values()];
}

// Concessão com `modulo: null` vale para todos — por isso a expansão.
function modulosDe(acesso) {
  return acesso.modulo ? [acesso.modulo] : MODULOS.map((modulo) => modulo.id);
}

/**
 * Concessões → { cabe, territorio, matriz }.
 *
 * `cabe: false` quando os módulos não compartilham o mesmo território: aí a
 * tela precisa cair para a lista antiga, senão salvar por cima perderia parte
 * da permissão.
 */
export function lerTerritorio(acessos = []) {
  const territorio = lugaresDe(acessos);
  const matriz = {};
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = NADA;
  });

  // Onde cada módulo aparece. Se um módulo cobre menos lugares que o
  // território, a permissão dele é mais estreita e a matriz não representa.
  const lugaresPorModulo = new Map();

  for (const acesso of acessos) {
    const lugar = chaveDoLugar(acesso.filial, acesso.centro);
    for (const modulo of modulosDe(acesso)) {
      if (!lugaresPorModulo.has(modulo)) lugaresPorModulo.set(modulo, new Set());
      lugaresPorModulo.get(modulo).add(lugar);
      // Vale a mais permissiva, como no resto do modelo.
      if (acesso.podeEditar) matriz[modulo] = EDITA;
      else if (matriz[modulo] === NADA) matriz[modulo] = VE;
    }
  }

  const totalDeLugares = territorio.length;
  const cabe = [...lugaresPorModulo.values()].every((lugares) => lugares.size === totalDeLugares);

  return { cabe, territorio: territorio.length ? territorio : [TUDO], matriz };
}

/**
 * { territorio, matriz } → concessões, no formato que o servidor grava.
 *
 * Uma por lugar × módulo que não esteja em `nada`. Quando TODOS os módulos têm
 * o mesmo estado, colapsa em `modulo: null` — é o que o modelo já entende por
 * "todos", e deixa a lista curta em vez de repetir oito linhas iguais.
 */
export function gerarConcessoes(territorio, matriz) {
  const lugares = territorio?.length ? territorio : [TUDO];
  const ativos = MODULOS.filter((modulo) => (matriz[modulo.id] ?? NADA) !== NADA);
  if (!ativos.length) return [];

  const estados = new Set(ativos.map((modulo) => matriz[modulo.id]));
  const todosIguais = ativos.length === MODULOS.length && estados.size === 1;

  const concessoes = [];
  for (const lugar of lugares) {
    if (todosIguais) {
      concessoes.push({
        modulo: null,
        filial: lugar.filial ?? null,
        centro: lugar.centro ?? null,
        podeEditar: matriz[ativos[0].id] === EDITA,
      });
      continue;
    }
    for (const modulo of ativos) {
      concessoes.push({
        modulo: modulo.id,
        filial: lugar.filial ?? null,
        centro: lugar.centro ?? null,
        podeEditar: matriz[modulo.id] === EDITA,
      });
    }
  }
  return concessoes;
}

// Estado seguinte ao clicar: nada → vê → edita → nada.
export function proximoEstado(atual) {
  if (atual === NADA) return VE;
  if (atual === VE) return EDITA;
  return NADA;
}
