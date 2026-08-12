import { MODULOS } from "./modulos.js";

// ============================================================================
// ÁREAS: ONDE + O QUÊ
//
// Duas leituras da MESMA permissão. O banco continua guardando concessões
// soltas — isto é só uma forma de escrevê-las e de lê-las de volta.
//
//   concessão  { modulo, filial, centro, podeEditar }   como grava
//   área       um território (filial × centro) + a matriz do que se faz nele
//
// POR QUE
// Autorar concessão a concessão obriga a montar um produto cartesiano — três
// módulos, duas filiais e quatro centros viram 24 linhas — e depois a fazer a
// união de cabeça para saber o que a pessoa pode.
//
// POR QUE VÁRIAS ÁREAS
// Uma só não cobre "edita na KING&JOE, mas só vê na MEN HUB". Cada área tem a
// sua matriz, e elas somam — como as concessões já somavam.
//
// A DECOMPOSIÇÃO É SEMPRE POSSÍVEL
// Todo conjunto de concessões vira áreas: calcula-se a matriz de cada LUGAR
// (filial × centro) e agrupam-se os lugares que têm matriz idêntica. Nenhuma
// permissão fica de fora, então a tela nunca precisa recusar um caso.
// ============================================================================

export const NADA = "nada";
export const VE = "ve";
export const EDITA = "edita";

export const TUDO = { filial: null, centro: null };

const chaveDoLugar = (filial, centro) => `${filial ?? ""}|${centro ?? ""}`;
const assinaturaDa = (matriz) => MODULOS.map((modulo) => matriz[modulo.id] ?? NADA).join(",");

export function matrizVazia() {
  const matriz = {};
  MODULOS.forEach((modulo) => {
    matriz[modulo.id] = NADA;
  });
  return matriz;
}

// Concessão com `modulo: null` vale para todos — por isso a expansão.
const modulosDe = (acesso) => (acesso.modulo ? [acesso.modulo] : MODULOS.map((m) => m.id));

/**
 * Concessões → lista de áreas.
 *
 * Cada área é `{ territorio: [{ filial, centro }], matriz }`. Lugares com a
 * mesma matriz caem na mesma área, que é o que deixa "as cinco filiais onde ela
 * só olha" virar uma linha em vez de cinco.
 */
export function lerAreas(acessos = []) {
  const porLugar = new Map();

  for (const acesso of acessos) {
    const chave = chaveDoLugar(acesso.filial, acesso.centro);
    if (!porLugar.has(chave)) {
      porLugar.set(chave, {
        lugar: { filial: acesso.filial ?? null, centro: acesso.centro ?? null },
        matriz: matrizVazia(),
      });
    }
    const { matriz } = porLugar.get(chave);
    for (const modulo of modulosDe(acesso)) {
      // Vale a mais permissiva, como no resto do modelo.
      if (acesso.podeEditar) matriz[modulo] = EDITA;
      else if (matriz[modulo] === NADA) matriz[modulo] = VE;
    }
  }

  const areas = new Map();
  for (const { lugar, matriz } of porLugar.values()) {
    const assinatura = assinaturaDa(matriz);
    if (!areas.has(assinatura)) areas.set(assinatura, { territorio: [], matriz });
    areas.get(assinatura).territorio.push(lugar);
  }

  return [...areas.values()];
}

/**
 * Áreas → concessões, no formato que o servidor grava.
 *
 * Quando TODOS os módulos da área têm o mesmo estado, colapsa em `modulo: null`
 * — é o que o modelo já entende por "todos", e deixa uma linha no lugar de oito.
 */
export function gerarConcessoes(areas = []) {
  const saida = new Map();

  for (const area of areas) {
    const lugares = area.territorio?.length ? area.territorio : [TUDO];
    const ativos = MODULOS.filter((modulo) => (area.matriz?.[modulo.id] ?? NADA) !== NADA);
    if (!ativos.length) continue;

    const estados = new Set(ativos.map((modulo) => area.matriz[modulo.id]));
    const todos = ativos.length === MODULOS.length && estados.size === 1;
    const alvos = todos ? [{ id: null, estado: area.matriz[ativos[0].id] }] : ativos.map((m) => ({ id: m.id, estado: area.matriz[m.id] }));

    for (const lugar of lugares) {
      for (const alvo of alvos) {
        const filial = lugar.filial ?? null;
        const centro = lugar.centro ?? null;
        const chave = `${alvo.id ?? ""}|${filial ?? ""}|${centro ?? ""}`;
        const podeEditar = alvo.estado === EDITA;
        // Áreas sobrepostas: a coluna é única por (login, módulo, filial,
        // centro), então a mais permissiva prevalece em vez de a última vencer.
        if (saida.has(chave) && saida.get(chave).podeEditar) continue;
        saida.set(chave, { modulo: alvo.id, filial, centro, podeEditar });
      }
    }
  }

  return [...saida.values()];
}

export function areaVazia() {
  return { territorio: [TUDO], matriz: matrizVazia() };
}

const nomeDe = (catalogo, id) => catalogo?.find((item) => item.id === id)?.nome ?? id;

function ondeDaArea(area, { filiais, centros } = {}) {
  const asFiliais = [...new Set(area.territorio.map((l) => l.filial).filter(Boolean))];
  const osCentros = [...new Set(area.territorio.map((l) => l.centro).filter(Boolean))];

  const partes = [];
  if (asFiliais.length) partes.push(asFiliais.map((id) => nomeDe(filiais, id)).join(", "));
  if (osCentros.length) partes.push(osCentros.map((id) => nomeDe(centros, id)).join(", "));
  return partes.length ? partes.join(" · ") : "tudo";
}

/**
 * Uma frase por área, em português.
 *
 * "Vai gravar 9 concessões" descreve o banco, não a pessoa. Quem confere uma
 * permissão quer saber o que ela vai poder — e é isso que precisa estar legível
 * na hora de salvar.
 */
export function descreverAreas(areas = [], catalogos = {}) {
  return areas
    .map((area) => {
      const edita = MODULOS.filter((m) => area.matriz?.[m.id] === EDITA);
      const ve = MODULOS.filter((m) => area.matriz?.[m.id] === VE);
      if (!edita.length && !ve.length) return null;

      const onde = ondeDaArea(area, catalogos);
      const todos = (lista) => lista.length === MODULOS.length;

      const acoes = [];
      if (edita.length) {
        acoes.push(`lança em ${todos(edita) ? "tudo" : edita.map((m) => m.titulo).join(", ")}`);
      }
      if (ve.length) {
        acoes.push(`só consulta ${todos(ve) ? "tudo" : ve.map((m) => m.titulo).join(", ")}`);
      }
      return `Em ${onde}: ${acoes.join("; ")}.`;
    })
    .filter(Boolean);
}
