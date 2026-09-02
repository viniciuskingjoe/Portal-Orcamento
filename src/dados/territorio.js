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

// Só a linha explícita (null, null) — vinda do banco ou de `[TUDO]` — conta
// como irrestrito. Lista vazia já foi tratada como o mesmo "tudo" (formato
// legado da tela antiga), mas isso trava a árvore: desmarcar o último local
// de um módulo não pode virar "libera pra empresa inteira" só porque sobrou
// um array vazio no meio da edição. Filial/centro mudam — a pessoa precisa
// poder tirar um local sem que o módulo se desligue ou vire irrestrito
// sozinho; vazio agora é "nenhum local ainda", ponto, e quem grava sabe: um
// módulo ligado sem nenhum lugar não concede nada (nunca "tudo").
export function territorioIrrestrito(territorio = []) {
  return territorio?.some((lugar) => lugar?.filial == null && lugar?.centro == null) ?? false;
}

const chaveDoTerritorio = ({ filial, centro }) => `${filial ?? ""}|${centro ?? ""}`;

function territorioCanonico(territorio = []) {
  if (territorioIrrestrito(territorio)) return [TUDO];

  const unicos = new Map();
  for (const lugar of territorio) {
    const normalizado = { filial: lugar?.filial ?? null, centro: lugar?.centro ?? null };
    unicos.set(chaveDoTerritorio(normalizado), normalizado);
  }
  return [...unicos.values()];
}

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

// ============================================================================
// LEITURA POR MÓDULO
//
// Mesma concessão, eixo trocado: em vez de "onde eu atuo + o que faço lá"
// (área), "este módulo + onde eu o uso". A tela pede módulo por módulo, então
// é esta forma que ela precisa — sem mexer no que é gravado.
//
// Cada módulo tem um território. O nível só é único quando todas as concessões
// concordam; quando há mistura, fica `null` e as linhas originais acompanham o
// cartão até uma escolha explícita uniformizá-las.
// ============================================================================

export function lerModulos(acessos = []) {
  const porModulo = new Map(
    MODULOS.map((modulo) => [modulo.id, { territorio: [], acessosOriginais: [] }])
  );

  for (const acesso of acessos) {
    for (const moduloId of modulosDe(acesso)) {
      const item = porModulo.get(moduloId);
      if (!item) continue;
      const lugar = { filial: acesso.filial ?? null, centro: acesso.centro ?? null };
      if (!item.territorio.some((l) => l.filial === lugar.filial && l.centro === lugar.centro)) {
        item.territorio.push(lugar);
      }
      // `modulo: null` é expandido aqui de propósito. Assim cada cartão pode
      // ser alterado sem uma concessão-curinga preservada por outro módulo
      // reabrir silenciosamente o acesso que a pessoa acabou de restringir.
      item.acessosOriginais.push({
        modulo: moduloId,
        filial: lugar.filial,
        centro: lugar.centro,
        podeEditar: acesso.podeEditar === true,
      });
    }
  }

  const saida = {};
  for (const modulo of MODULOS) {
    const { territorio, acessosOriginais } = porModulo.get(modulo.id);
    const niveis = new Set(acessosOriginais.map((acesso) => (acesso.podeEditar ? EDITA : VE)));
    saida[modulo.id] = {
      ligado: acessosOriginais.length > 0,
      territorio: acessosOriginais.length ? territorioCanonico(territorio) : [],
      // Nível misto não escolhe o mais forte: até a pessoa decidir uniformizar
      // explicitamente, `gerarConcessoesDeModulos` devolve o recorte original.
      nivel: niveis.size > 1 ? null : [...niveis][0] ?? VE,
      acessosOriginais,
    };
  }
  return saida;
}

/** Configuração por módulo → concessões, no formato que o servidor grava. */
export function gerarConcessoesDeModulos(config = {}) {
  const saida = new Map();

  function adicionar(acesso) {
    const normalizado = {
      modulo: acesso.modulo ?? null,
      filial: acesso.filial ?? null,
      centro: acesso.centro ?? null,
      podeEditar: acesso.podeEditar === true,
    };
    const chave = `${normalizado.modulo ?? ""}|${chaveDoTerritorio(normalizado)}`;
    const existente = saida.get(chave);
    // Se vier uma combinação redundante, conserva a mais permissiva — é a
    // mesma regra usada na leitura e evita depender da ordem do lote no banco.
    if (!existente?.podeEditar || normalizado.podeEditar) saida.set(chave, normalizado);
  }

  for (const modulo of MODULOS) {
    const item = config[modulo.id];
    if (!item?.ligado) continue;

    if (item.nivel === null) {
      // A tela ainda não escolheu transformar uma permissão mista em uniforme.
      // Regravar o que já existia é a única opção que não promove nem rebaixa.
      for (const acesso of item.acessosOriginais ?? []) adicionar(acesso);
      continue;
    }

    const lugares = territorioCanonico(item.territorio);
    for (const lugar of lugares) {
      adicionar({
        modulo: modulo.id,
        filial: lugar.filial ?? null,
        centro: lugar.centro ?? null,
        podeEditar: item.nivel === EDITA,
      });
    }
  }
  return [...saida.values()];
}

/**
 * Aplica um nível aos oito módulos sem apagar recortes territoriais já
 * escolhidos. Um módulo que nunca teve escopo precisa de um padrão ao ser
 * ligado; nesse único caso recebe acesso à empresa inteira.
 */
export function aplicarNivelAosModulos(config = {}, nivel) {
  const novo = {};

  for (const modulo of MODULOS) {
    const atual = config[modulo.id] ?? {
      ligado: false,
      territorio: [],
      nivel: VE,
      acessosOriginais: [],
    };

    novo[modulo.id] = nivel
      ? {
          ...atual,
          ligado: true,
          territorio: atual.territorio?.length ? atual.territorio : [TUDO],
          nivel,
        }
      : { ...atual, ligado: false };
  }

  return novo;
}

const nomeDe = (catalogo, id) => catalogo?.find((item) => item.id === id)?.nome ?? id;

export function ondeDaArea(area, { filiais, centros } = {}) {
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

// ============================================================================
// ÁRVORE DE FILIAL × CENTRO
//
// Mesmo território de sempre (`[{ filial, centro }]`) — só a edição vira
// árvore de duas alturas em vez de dois seletores soltos: marca a filial
// inteira, ou expande e marca só alguns centros dela. Filial e centro são
// dimensões independentes no ERP (um centro não pertence a uma filial só, o
// mesmo centro serve várias), mas quem concede permissão pensa "nesta filial,
// estes centros" — a árvore segue esse jeito de pensar, não o schema.
//
// Vazio continua valendo por "todas as filiais, todos os centros", igual aos
// dois seletores que ela substitui — marcar algo é que estreita.
// ============================================================================

/**
 * Território → linhas prontas para `LinhaConta`, dado quais filiais estão
 * abertas. `forcarVazio` é usado só na transição "toda a empresa" → "escolher
 * locais": em vez de já entrar com tudo marcado (pra pessoa ter que desmarcar
 * uma por uma), a árvore mostra tudo desmarcado até o primeiro clique real —
 * sem isso alterar o território guardado, que só muda nesse primeiro clique.
 */
export function nosDoTerritorio(territorio, catalogos, abertos, { forcarVazio = false } = {}) {
  // Só a leitura é materializada. Sem interação, o round-trip continua
  // preservando tanto (null, null) quanto (null, centro); no primeiro toggle,
  // as funções abaixo expandem os curingas para permitir tirar uma filial só.
  const materializado = forcarVazio ? [] : materializarTerritorio(territorio, catalogos);
  const nos = [];

  for (const filial of catalogos.filiais) {
    const lugaresDaFilial = materializado.filter((lugar) => lugar.filial === filial.id);
    const filialInteira = lugaresDaFilial.some((lugar) => lugar.centro == null);
    const centrosMarcados = new Set(lugaresDaFilial.map((lugar) => lugar.centro).filter(Boolean));
    const algumMarcado = filialInteira || centrosMarcados.size > 0;
    const estado = filialInteira ? "total" : algumMarcado ? "parcial" : "vazio";
    const aberto = abertos.has(filial.id);

    nos.push({
      codigo: filial.id,
      descricao: filial.nome,
      nivel: 0,
      temFilhos: catalogos.centros.length > 0,
      sintetica: true,
      selecionavel: true,
      aberto,
      estado,
      marcadosAbaixo: filialInteira ? catalogos.centros.length : centrosMarcados.size,
    });

    if (!aberto) continue;

    for (const centro of catalogos.centros) {
      const marcado = filialInteira || centrosMarcados.has(centro.id);
      nos.push({
        codigo: centro.id,
        descricao: centro.nome,
        nivel: 1,
        temFilhos: false,
        sintetica: false,
        selecionavel: true,
        estado: marcado ? "total" : "vazio",
        filialId: filial.id,
        centroId: centro.id,
      });
    }
  }

  return nos;
}

// Vazio marcado por uma filial de cada vez, pra poder tirar só uma sem perder
// as outras implícitas em "tudo".
function materializarTudo(catalogos) {
  return catalogos.filiais.map((filial) => ({ filial: filial.id, centro: null }));
}

// Expande somente para a interação. `(null, centro)` significa o mesmo centro
// em todas as filiais; sem esta etapa, desmarcá-lo em uma filial manteria o
// curinga global e o clique não reduziria acesso nenhum.
function materializarTerritorio(territorio, catalogos) {
  if (territorioIrrestrito(territorio)) return materializarTudo(catalogos);

  const materializado = [];
  for (const lugar of territorioCanonico(territorio)) {
    if (lugar.filial == null) {
      for (const filial of catalogos.filiais) {
        materializado.push({ filial: filial.id, centro: lugar.centro });
      }
    } else {
      materializado.push(lugar);
    }
  }
  return territorioCanonico(materializado);
}

// O inverso: todo mundo marcado inteiro é só outro jeito de dizer "tudo" — uma
// linha em vez de uma por filial, igual ao resto do modelo já faz por módulo.
function compactarSeTudo(territorio, catalogos) {
  if (!catalogos.filiais.length) return territorio;
  const todasInteiras = catalogos.filiais.every((filial) =>
    territorio.some((lugar) => lugar.filial === filial.id && lugar.centro == null)
  );
  return todasInteiras ? [TUDO] : territorio;
}

/** Marca ou desmarca uma filial inteira (todos os centros dela de uma vez). */
export function alternarFilialNaArvore(territorio, catalogos, filialId, estadoAtual) {
  const base = materializarTerritorio(territorio, catalogos);
  const semEssaFilial = base.filter((lugar) => lugar.filial !== filialId);
  if (estadoAtual === "total") {
    // Pode esvaziar de verdade: vazio aqui é "nenhum local ainda", não
    // "tudo" — filial/centro mudam, e desmarcar a última não pode reabrir
    // acesso irrestrito nem desligar o módulo por baixo dos panos.
    return semEssaFilial;
  }
  return compactarSeTudo([...semEssaFilial, { filial: filialId, centro: null }], catalogos);
}

/**
 * Marca ou desmarca um centro dentro de uma filial. Todos marcados compacta de
 * volta em "filial inteira"; nenhum marcado tira a filial da lista.
 */
export function alternarCentroNaArvore(territorio, catalogos, filialId, centroId, marcadoAgora) {
  const base = materializarTerritorio(territorio, catalogos);
  const outrasFiliais = base.filter((lugar) => lugar.filial !== filialId);
  const lugaresDaFilial = base.filter((lugar) => lugar.filial === filialId);
  const filialInteira = lugaresDaFilial.some((lugar) => lugar.centro == null);

  const centrosMarcados = new Set(
    filialInteira ? catalogos.centros.map((centro) => centro.id) : lugaresDaFilial.map((lugar) => lugar.centro)
  );

  if (marcadoAgora) centrosMarcados.delete(centroId);
  else centrosMarcados.add(centroId);

  if (!centrosMarcados.size) {
    // Mesma lógica de `alternarFilialNaArvore`: pode esvaziar de verdade.
    return outrasFiliais;
  }
  if (centrosMarcados.size === catalogos.centros.length) {
    return compactarSeTudo([...outrasFiliais, { filial: filialId, centro: null }], catalogos);
  }
  return [
    ...outrasFiliais,
    ...catalogos.centros
      .filter((centro) => centrosMarcados.has(centro.id))
      .map((centro) => ({ filial: filialId, centro: centro.id })),
  ];
}
