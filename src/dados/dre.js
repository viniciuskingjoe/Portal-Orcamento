import { modulo as definicaoDoModulo } from "./modulos.js";
import { SEM_CENTRO, centrosDaFilial, contasDoCentro } from "./visao.js";
import { chavePlanejado } from "./plano.js";
import { somarRealizado } from "./realizado.js";
import { avaliarFormula } from "./formula.js";
import { mesTemRealizado } from "./calendario.js";
import { CATALOGO_VAZIO } from "./contas.js";

// ============================================================================
// DRE CONFIGURÁVEL
//
// O DRE existiu antes com uma estrutura FIXA — um módulo inteiro era sempre
// uma linha, sempre a mesma ordem (ver git 01a4361) — e foi removido de
// propósito: toda dúvida sobre onde uma conta mora virava dúvida sobre não
// dobrar um subtotal do DRE.
//
// Aqui uma linha soma um RECORTE de contas de um módulo (não o módulo
// inteiro — a granularidade é da linha, não do módulo), ou é uma fórmula que
// referencia outras linhas (L[id], mesmo motor de dados/formula.js que
// Despesas com pessoal usa para V[conta]). O modelo (a lista de linhas,
// ordenada) mora na visão — `visao.dreLinhas`.
// ============================================================================

// Contas (com o sinal de CADA UMA) que uma linha "origem: modulo" soma num
// centro: a lista explícita escolhida ao configurar a linha — cada conta com
// seu próprio +/-, não um sinal só pra linha inteira — ou, se vazia, todas as
// contas que o módulo tem naquele centro, todas com o sinal único da linha
// (`linha.sinal`, fallback pra quem não quer recortar).
function valoresDaLinhaNoCentro(linha, visao, filialId, centroId) {
  if (linha.valores?.length) return linha.valores;
  const sinal = linha.sinal ?? 1;
  return contasDoCentro(visao, linha.moduloId, filialId, centroId).map((codigo) => ({ codigo, sinal }));
}

// Centros a percorrer: os que a visão deu ao módulo naquela filial, cortados
// pelo grupo de centro de custo escolhido na leitura. `null` = sem grupo
// escolhido, todos os centros valem — é o "Todos os centros" da tela.
function centrosDaLeitura(visao, moduloId, filialId, centrosPermitidos) {
  const todos = centrosDaFilial(visao, moduloId, filialId);
  if (!centrosPermitidos) return todos;
  return todos.filter((centroId) => centrosPermitidos.has(centroId));
}

function planejadoDaLinhaModulo(linha, plano, visao, filiais, centrosPermitidos, mes) {
  let total = 0;
  filiais.forEach((filial) => {
    centrosDaLeitura(visao, linha.moduloId, filial.id, centrosPermitidos).forEach((centroId) => {
      valoresDaLinhaNoCentro(linha, visao, filial.id, centroId).forEach(({ codigo, sinal }) => {
        const valor =
          plano?.planejado?.[chavePlanejado(linha.moduloId, filial.id, centroId, codigo, mes)] ?? 0;
        total += (sinal ?? 1) * valor;
      });
    });
  });
  return total;
}

// Realizado é sempre por centro específico aqui, nunca o consolidado
// "SEM_CENTRO" que soma a filial inteira de uma vez — o grupo de centro de
// custo precisa poder excluir um centro da soma, e o índice consolidado
// (`porContaFilialMes`) não sabe de onde cada valor veio.
function realizadoDaLinhaModulo({
  linha,
  visao,
  filiais,
  centrosPermitidos,
  catalogo,
  sinais,
  visaoContabil,
  indice,
  mes,
}) {
  const definicao = definicaoDoModulo(linha.moduloId);
  let total = 0;
  filiais.forEach((filial) => {
    centrosDaLeitura(visao, linha.moduloId, filial.id, centrosPermitidos).forEach((centroId) => {
      // Uma chamada a `somarRealizado` por conta, não uma para o recorte
      // inteiro — é a única forma de aplicar o sinal de CADA conta (que
      // `somarRealizado` não conhece) em vez de um sinal só pra soma toda.
      valoresDaLinhaNoCentro(linha, visao, filial.id, centroId).forEach(({ codigo, sinal }) => {
        const valor = somarRealizado({
          indice,
          catalogo,
          contas: [codigo],
          filiais: [filial],
          centroId,
          mes,
          tipoPadrao: definicao?.tipo,
          sinais,
          visaoContabil,
        });
        total += (sinal ?? 1) * valor;
      });
    });
  });
  return total;
}

// Valor de UMA linha, UM mês, UMA métrica (planejado/realizado/anterior).
// `emResolucao` trava referência circular entre linhas fórmula — guarda a
// chave completa (linha+mês+métrica), porque a mesma linha em meses ou
// métricas diferentes não é a mesma resolução.
function valorDaLinhaNoMes(linhaId, contexto, metrica, mes, emResolucao) {
  const linha = contexto.linhasPorId.get(linhaId);
  if (!linha) return 0;

  if (linha.origem === "modulo") {
    if (metrica === "planejado") {
      return planejadoDaLinhaModulo(
        linha,
        contexto.plano,
        contexto.visao,
        contexto.filiais,
        contexto.centrosPermitidos,
        mes
      );
    }
    const indice = metrica === "realizado" ? contexto.realizado : contexto.realizadoAnterior;
    return realizadoDaLinhaModulo({
      linha,
      visao: contexto.visao,
      filiais: contexto.filiais,
      centrosPermitidos: contexto.centrosPermitidos,
      catalogo: contexto.catalogo,
      sinais: contexto.sinais,
      visaoContabil: contexto.visaoContabil,
      indice,
      mes,
    });
  }

  // origem: "formula" — referencia outras linhas, nunca contas diretamente.
  const chave = `${linhaId}|${mes}|${metrica}`;
  if (emResolucao.has(chave)) {
    throw new Error(`A fórmula de "${linha.titulo}" depende dela mesma (referência circular).`);
  }
  const proxima = new Set(emResolucao).add(chave);

  return avaliarFormula(linha.formula, (codigo, prefixo) => {
    if (prefixo !== "L") {
      throw new Error(`Fórmula de linha do DRE só referencia outras linhas — "${prefixo}[${codigo}]" não vale aqui.`);
    }
    return valorDaLinhaNoMes(codigo, contexto, metrica, mes, proxima);
  });
}

// Fórmula quebrada (referência circular, linha apagada) não pode derrubar o
// demonstrativo inteiro — vira 0, com o erro visível só para quem edita
// aquela linha, no editor.
function valorSeguro(linhaId, contexto, metrica, mes) {
  try {
    return valorDaLinhaNoMes(linhaId, contexto, metrica, mes, new Set());
  } catch {
    return 0;
  }
}

function variacao(realizado, anterior) {
  const diferenca = realizado - anterior;
  return {
    variacao: diferenca,
    variacaoPercentual: anterior ? (diferenca / Math.abs(anterior)) * 100 : 0,
  };
}

function participacao(valor, base) {
  return base ? (valor / base) * 100 : 0;
}

// Meses de `inicio` a `fim`, inclusive, dentro do mesmo ano — período
// customizável fica dentro do ano do plano ativo. Cruzar para outro ano
// juntaria dados de outro plano (pode haver mais de um por ano) e não foi
// pedido; o comparativo "ano anterior" já cobre a maior parte do que
// cruzar ano serviria.
export function mesesDoPeriodo(inicio, fim) {
  const de = Math.max(1, Math.min(12, inicio ?? 1));
  const ate = Math.max(1, Math.min(12, fim ?? 12));
  const meses = [];
  for (let mes = Math.min(de, ate); mes <= Math.max(de, ate); mes += 1) meses.push(mes);
  return meses;
}

// Monta o demonstrativo inteiro: uma entrada por linha do modelo, com o valor
// de cada mês do período mais o total agregado, e a análise vertical (% sobre
// a linha marcada `baseAnaliseVertical`). `centrosPermitidos` é o recorte do
// grupo de centro de custo (Set de ids, ou `null` = todos).
export function calcularDre({
  visao,
  plano,
  filiais,
  meses,
  centrosPermitidos = null,
  catalogo = CATALOGO_VAZIO,
  sinais = {},
  realizado,
  realizadoAnterior,
}) {
  const modelo = visao?.dreLinhas ?? [];
  if (!modelo.length || !plano || !filiais?.length) return [];

  const linhasPorId = new Map(modelo.map((linha) => [linha.id, linha]));
  const contexto = {
    plano,
    visao,
    filiais,
    centrosPermitidos,
    catalogo,
    sinais,
    visaoContabil: visao?.visaoContabil,
    realizado,
    realizadoAnterior,
    linhasPorId,
  };

  const base = modelo.find((linha) => linha.baseAnaliseVertical) ?? null;
  const ano = plano.ano;

  return modelo
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((linha) => {
      const porMes = meses.map((mes) => {
        const planejado = valorSeguro(linha.id, contexto, "planejado", mes);
        const houveRealizado = mesTemRealizado(ano, mes);
        const houveAnterior = mesTemRealizado(ano - 1, mes);
        const realizadoDoMes = houveRealizado ? valorSeguro(linha.id, contexto, "realizado", mes) : 0;
        const anteriorDoMes = houveAnterior ? valorSeguro(linha.id, contexto, "anterior", mes) : 0;

        const basePlanejada = base ? valorSeguro(base.id, contexto, "planejado", mes) : 0;
        const baseRealizada =
          base && houveRealizado ? valorSeguro(base.id, contexto, "realizado", mes) : 0;

        return {
          id: mes,
          label: `${String(mes).padStart(2, "0")}/${ano}`,
          planejado,
          realizado: realizadoDoMes,
          anterior: anteriorDoMes,
          analiseVerticalPlanejado: participacao(planejado, basePlanejada),
          analiseVerticalRealizado: participacao(realizadoDoMes, baseRealizada),
          ...variacao(realizadoDoMes, anteriorDoMes),
        };
      });

      const total = {
        id: "total",
        label: "Total",
        planejado: porMes.reduce((soma, m) => soma + m.planejado, 0),
        realizado: porMes.reduce((soma, m) => soma + m.realizado, 0),
        anterior: porMes.reduce((soma, m) => soma + m.anterior, 0),
      };
      const totalBasePlanejada = base
        ? meses.reduce((soma, mes) => soma + valorSeguro(base.id, contexto, "planejado", mes), 0)
        : 0;
      const totalBaseRealizada = base
        ? meses.reduce(
            (soma, mes) =>
              soma + (mesTemRealizado(ano, mes) ? valorSeguro(base.id, contexto, "realizado", mes) : 0),
            0
          )
        : 0;
      total.analiseVerticalPlanejado = participacao(total.planejado, totalBasePlanejada);
      total.analiseVerticalRealizado = participacao(total.realizado, totalBaseRealizada);
      Object.assign(total, variacao(total.realizado, total.anterior));

      return {
        id: linha.id,
        titulo: linha.titulo,
        origem: linha.origem,
        moduloId: linha.origem === "modulo" ? linha.moduloId : null,
        mostra: linha.mostra !== false,
        destaca: linha.destaca === true,
        baseAnaliseVertical: linha.baseAnaliseVertical === true,
        linhaPrincipal: linha.linhaPrincipal === true,
        unidade: linha.unidade === "percentual" ? "percentual" : "moeda",
        meses: porMes,
        total,
      };
    });
}
