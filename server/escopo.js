import { ehAdmin, podeVer } from "../src/dados/permissoes.js";

const SEM_CENTRO = "";

function chaveDoRealizado(classificacao, filial, centro) {
  return `${classificacao}|${filial}|${centro ?? SEM_CENTRO}`;
}

function filtrarMapa(mapa, permitir) {
  return Object.fromEntries(Object.entries(mapa ?? {}).filter(([chave, valor]) => permitir(chave, valor)));
}

function filtrarVisao(sessao, visao) {
  const modulos = {};
  const contasPorModulo = new Map();

  for (const [moduloId, modulo] of Object.entries(visao.modulos ?? {})) {
    if (!podeVer(sessao, { modulo: moduloId })) continue;

    const filiais = {};
    const contasPermitidas = new Set();

    for (const [filialId, filial] of Object.entries(modulo.filiais ?? {})) {
      if (!podeVer(sessao, { modulo: moduloId, filial: filialId })) continue;

      const centros = {};
      for (const [centroId, contas] of Object.entries(filial.centros ?? {})) {
        if (!podeVer(sessao, { modulo: moduloId, filial: filialId, centro: centroId })) continue;
        centros[centroId] = contas;
        (contas ?? []).forEach((conta) => contasPermitidas.add(conta));
      }

      // Uma concessão presa a centro pode casar com a filial quando a pergunta
      // ainda não fixou o centro. A filial só é realmente visível se ao menos
      // um centro mapeado também atravessou a checagem completa acima.
      if (!Object.keys(centros).length) continue;

      filiais[filialId] = {
        ...filial,
        centros,
        // A lista consolidada precisa refletir apenas os centros liberados.
        contas: [...new Set(Object.values(centros).flat())].sort(),
      };
    }

    if (!Object.keys(filiais).length) continue;

    contasPorModulo.set(moduloId, contasPermitidas);
    modulos[moduloId] = {
      ...modulo,
      filiais,
      sinais: filtrarMapa(modulo.sinais, (conta) => contasPermitidas.has(conta)),
      formulas: filtrarMapa(modulo.formulas, (conta) => contasPermitidas.has(conta)),
    };
  }

  const dreLinhas = (visao.dreLinhas ?? [])
    .filter((linha) => linha.origem !== "modulo" || Object.hasOwn(modulos, linha.moduloId))
    .map((linha) => {
      if (linha.origem !== "modulo") return linha;
      const contasPermitidas = contasPorModulo.get(linha.moduloId) ?? new Set();
      return {
        ...linha,
        valores: (linha.valores ?? []).filter((item) => contasPermitidas.has(item.codigo)),
      };
    });

  return { ...visao, modulos, dreLinhas };
}

function planejadoPermitido(sessao, planejado) {
  return filtrarMapa(planejado, (chave) => {
    const [modulo, filial, centro = SEM_CENTRO] = chave.split("|");
    return podeVer(sessao, { modulo, filial, centro });
  });
}

function funcionariosPermitidos(sessao, funcionarios) {
  return filtrarMapa(funcionarios, (chave) => {
    const [filial, centro = SEM_CENTRO] = chave.split("|");
    return podeVer(sessao, { modulo: "despesas-pessoal", filial, centro });
  });
}

// O estado completo continua sendo montado uma vez no repositório, mas nada
// fora do escopo atravessa a fronteira HTTP. A função é pura para que a regra
// seja testada sem banco e não volte a depender de filtros da interface.
export function filtrarEstadoPorSessao(estado, sessao) {
  if (ehAdmin(sessao)) return estado;

  const filiaisAtivas = estado?.configuracao?.filiaisAtivas;
  const visoes = (estado?.visoes ?? [])
    .map((visao) => filtrarVisao(sessao, visao))
    .filter((visao) => Object.keys(visao.modulos).length > 0);
  const visoesPermitidas = new Set(visoes.map((visao) => visao.id));
  return {
    ...estado,
    configuracao: {
      ...estado?.configuracao,
      filiaisAtivas: Array.isArray(filiaisAtivas)
        ? filiaisAtivas.filter((filial) => podeVer(sessao, { filial }))
        : filiaisAtivas,
    },
    visoes,
    planos: (estado?.planos ?? [])
      .filter((plano) => visoesPermitidas.has(plano.visaoId))
      .map((plano) => ({
        ...plano,
        planejado: planejadoPermitido(sessao, plano.planejado),
        funcionarios: funcionariosPermitidos(sessao, plano.funcionarios),
      })),
  };
}

export function filtrarRealizadoPorSessao(linhas, vinculos, sessao) {
  if (ehAdmin(sessao)) return linhas ?? [];

  const permitidas = new Set(
    (vinculos ?? [])
      .filter((item) =>
        podeVer(sessao, {
          modulo: item.modulo,
          filial: item.filial,
          centro: item.centro ?? SEM_CENTRO,
        })
      )
      .map((item) => chaveDoRealizado(item.classificacao, item.filial, item.centro))
  );

  return (linhas ?? []).filter((linha) =>
    permitidas.has(chaveDoRealizado(linha.classificacao, linha.filial, linha.centro))
  );
}

export function filtrarGruposPorSessao(grupos, sessao) {
  if (ehAdmin(sessao)) return grupos ?? [];
  return (grupos ?? [])
    .map((grupo) => ({
      ...grupo,
      centros: (grupo.centros ?? []).filter((centro) => podeVer(sessao, { centro })),
    }))
    .filter((grupo) => grupo.centros.length > 0);
}
