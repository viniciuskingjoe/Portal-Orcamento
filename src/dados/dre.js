import { MODULOS, modulo as definicaoDoModulo } from "./modulos.js";
import { centrosDaFilial, contasDaFilial, contasDoCentro, filiaisDoModulo } from "./visao.js";
import { planejadoDoMes } from "./plano.js";
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

// Linha "origem: modulo" sem NENHUMA conta escolhida soma o módulo inteiro
// — com o sinal único da linha, comportamento de sempre. Dentro da lista de
// contas escolhidas, porém, dá pra INCLUIR "Total" como uma entrada a mais
// (`TOTAL_MODULO_TOKEN`) — todas as contas do módulo naquele centro, com o
// sinal DAQUELA entrada, ao lado de contas específicas com o sinal delas.
// Ex.: Total (+) e uma conta específica (−) é "tudo, menos essa".
export const TOTAL_MODULO_TOKEN = "__total__";

// Contas (com o sinal de CADA UMA) que uma linha "origem: modulo" soma num
// centro — cada conta com seu próprio +/-, não um sinal só pra linha
// inteira. "Total" expande inline pras contas reais daquele centro.
function valoresDaLinhaNoCentro(linha, visao, filialId, centroId) {
  const contasDoModuloNoCentro = () => contasDoCentro(visao, linha.moduloId, filialId, centroId);

  if (!linha.valores?.length) {
    const sinal = linha.sinal ?? 1;
    return contasDoModuloNoCentro().map((codigo) => ({ codigo, sinal }));
  }

  const resultado = [];
  linha.valores.forEach((item) => {
    if (item.codigo === TOTAL_MODULO_TOKEN) {
      contasDoModuloNoCentro().forEach((codigo) => resultado.push({ codigo, sinal: item.sinal ?? 1 }));
    } else {
      resultado.push(item);
    }
  });
  return resultado;
}

// Contas distintas que uma entrada "Total" cobre, em TODOS os filiais/
// centros do contexto — cada código uma vez só (a soma de cada um já
// agrega os centros sozinha, em `valorDoCodigoSeguro`). Usado só pro
// drill-down: a soma de verdade continua vindo de `valoresDaLinhaNoCentro`,
// que expande "Total" centro a centro dentro do loop de cálculo.
function codigosDoTotal(moduloId, sinal, visao, filiais, centrosPermitidos) {
  const codigos = new Set();
  filiais.forEach((filial) => {
    centrosDaLeitura(visao, moduloId, filial.id, centrosPermitidos).forEach((centroId) => {
      contasDoCentro(visao, moduloId, filial.id, centroId).forEach((codigo) => codigos.add(codigo));
    });
  });
  return [...codigos].map((codigo) => ({ codigo, sinal: sinal ?? 1 }));
}

// Centros a percorrer: os que a visão deu ao módulo naquela filial, cortados
// pelo grupo de centro de custo escolhido na leitura. `null` = sem grupo
// escolhido, todos os centros valem — é o "Todos os centros" da tela.
function centrosDaLeitura(visao, moduloId, filialId, centrosPermitidos) {
  const todos = centrosDaFilial(visao, moduloId, filialId);
  if (!centrosPermitidos) return todos;
  return todos.filter((centroId) => centrosPermitidos.has(centroId));
}

// `planejadoDoMes` (dados/plano.js) faz a leitura de verdade — é a única
// função que sabe converter os DOIS formatos de planejado: reais direto
// (a maioria dos módulos) ou percentual sobre a receita (Deduções de
// vendas, Custos variáveis), e também resolve conta calculada (fórmula, em
// Despesas com pessoal). Ler `plano.planejado[chave]` direto, como esta
// função fazia antes, pegava só o formato reais — percentual e fórmula
// sempre voltavam 0 no DRE, mesmo com valor certo na tela do módulo.
function planejadoDaLinhaModulo(linha, plano, visao, filiais, centrosPermitidos, mes) {
  let total = 0;
  filiais.forEach((filial) => {
    centrosDaLeitura(visao, linha.moduloId, filial.id, centrosPermitidos).forEach((centroId) => {
      valoresDaLinhaNoCentro(linha, visao, filial.id, centroId).forEach(({ codigo, sinal }) => {
        const { reais } = planejadoDoMes(plano, visao, linha.moduloId, [filial], centroId, [codigo], mes, null);
        total += (sinal ?? 1) * reais;
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

// Mesmo cálculo de `planejadoDaLinhaModulo`/`realizadoDaLinhaModulo`, mas pra
// UMA conta só — é o que alimenta o drill-down: expandir uma linha "módulo"
// com mais de uma conta escolhida mostra o valor de cada uma, sem precisar
// somar de novo (a soma continua vindo das funções acima, que já fazem o
// mesmo percurso filial→centro→conta).
function planejadoDoCodigo(moduloId, codigo, sinal, plano, visao, filiais, centrosPermitidos, mes) {
  let total = 0;
  filiais.forEach((filial) => {
    centrosDaLeitura(visao, moduloId, filial.id, centrosPermitidos).forEach((centroId) => {
      const { reais } = planejadoDoMes(plano, visao, moduloId, [filial], centroId, [codigo], mes, null);
      total += (sinal ?? 1) * reais;
    });
  });
  return total;
}

function realizadoDoCodigo({ moduloId, codigo, sinal, visao, filiais, centrosPermitidos, catalogo, sinais, visaoContabil, indice, mes }) {
  const definicao = definicaoDoModulo(moduloId);
  let total = 0;
  filiais.forEach((filial) => {
    centrosDaLeitura(visao, moduloId, filial.id, centrosPermitidos).forEach((centroId) => {
      total +=
        (sinal ?? 1) *
        somarRealizado({
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

  // origem: "formula" — soma/subtrai outras linhas (L[]) ou contas direto
  // (V[], sem sinal próprio — o sinal vem do operador na própria expressão,
  // igual em Despesas com pessoal). Referenciar a MESMA conta que já entra
  // numa linha "módulo" que esta fórmula também soma é conta duas vezes —
  // a tela não impede, é decisão de quem monta o demonstrativo.
  const chave = `${linhaId}|${mes}|${metrica}`;
  if (emResolucao.has(chave)) {
    throw new Error(`A fórmula de "${linha.titulo}" depende dela mesma (referência circular).`);
  }
  const proxima = new Set(emResolucao).add(chave);

  return avaliarFormula(linha.formula, (codigo, prefixo) => {
    if (prefixo === "L") {
      return valorDaLinhaNoMes(codigo, contexto, metrica, mes, proxima);
    }
    if (prefixo === "V") {
      return valorDaContaNoMes(codigo, contexto, metrica, mes);
    }
    throw new Error(`Fórmula de linha do DRE só referencia linhas (L[]) ou contas (V[]) — "${prefixo}[${codigo}]" não vale aqui.`);
  });
}

// Em que módulo esta conta está configurada nesta visão — procura nos oito
// módulos fixos porque a fórmula de uma linha não escolhe módulo (só a
// linha "origem: modulo" escolhe). Uma conta normalmente mora em um só
// módulo; sem achar em nenhum (conta não configurada, ou removida depois
// que a fórmula foi escrita), vale 0 em vez de quebrar o demonstrativo.
function moduloDaConta(visao, codigo) {
  for (const modulo of MODULOS) {
    const usaEmAlgumaFilial = filiaisDoModulo(visao, modulo.id).some((filialId) =>
      contasDaFilial(visao, modulo.id, filialId).includes(codigo)
    );
    if (usaEmAlgumaFilial) return modulo.id;
  }
  return null;
}

function valorDaContaNoMes(codigo, contexto, metrica, mes) {
  const moduloId = moduloDaConta(contexto.visao, codigo);
  if (!moduloId) return 0;

  if (metrica === "planejado") {
    return planejadoDoCodigo(moduloId, codigo, 1, contexto.plano, contexto.visao, contexto.filiais, contexto.centrosPermitidos, mes);
  }
  const indice = metrica === "realizado" ? contexto.realizado : contexto.realizadoAnterior;
  return realizadoDoCodigo({
    moduloId,
    codigo,
    sinal: 1,
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

// Mesma proteção de `valorSeguro`, para o valor de UMA conta do drill-down.
function valorDoCodigoSeguro(moduloId, codigo, sinal, contexto, metrica, mes) {
  try {
    if (metrica === "planejado") {
      return planejadoDoCodigo(moduloId, codigo, sinal, contexto.plano, contexto.visao, contexto.filiais, contexto.centrosPermitidos, mes);
    }
    const indice = metrica === "realizado" ? contexto.realizado : contexto.realizadoAnterior;
    return realizadoDoCodigo({
      moduloId,
      codigo,
      sinal,
      visao: contexto.visao,
      filiais: contexto.filiais,
      centrosPermitidos: contexto.centrosPermitidos,
      catalogo: contexto.catalogo,
      sinais: contexto.sinais,
      visaoContabil: contexto.visaoContabil,
      indice,
      mes,
    });
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

  // Meses + Total de UMA série (a linha inteira, ou uma conta do drill-down)
  // a partir de um provedor `valorBruto(metrica, mes)` — mesmo cálculo dos
  // dois casos, só troca de onde o número bruto vem. A base da análise
  // vertical é sempre a mesma linha marcada na visão, mesmo dentro do
  // drill-down: a % de uma conta é sobre a receita líquida, não sobre a
  // linha-pai.
  function montarSerie(valorBruto) {
    const porMes = meses.map((mes) => {
      const planejado = valorBruto("planejado", mes);
      const houveRealizado = mesTemRealizado(ano, mes);
      const houveAnterior = mesTemRealizado(ano - 1, mes);
      const realizadoDoMes = houveRealizado ? valorBruto("realizado", mes) : 0;
      const anteriorDoMes = houveAnterior ? valorBruto("anterior", mes) : 0;

      const basePlanejada = base ? valorSeguro(base.id, contexto, "planejado", mes) : 0;
      const baseRealizada = base && houveRealizado ? valorSeguro(base.id, contexto, "realizado", mes) : 0;

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
          (soma, mes) => soma + (mesTemRealizado(ano, mes) ? valorSeguro(base.id, contexto, "realizado", mes) : 0),
          0
        )
      : 0;
    total.analiseVerticalPlanejado = participacao(total.planejado, totalBasePlanejada);
    total.analiseVerticalRealizado = participacao(total.realizado, totalBaseRealizada);
    Object.assign(total, variacao(total.realizado, total.anterior));

    return { porMes, total };
  }

  return modelo
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((linha) => {
      const { porMes, total } = montarSerie((metrica, mes) => valorSeguro(linha.id, contexto, metrica, mes));

      // Drill-down: qualquer recorte explícito (mesmo uma conta só) pode
      // expandir — é a única forma de conferir qual conta está por trás do
      // número sem sair da tela. `valores: []` (soma o módulo inteiro, sem
      // recorte nenhum) não expande: não há uma lista curta pra mostrar.
      // "Total" dentro do recorte expande pras contas reais que ele cobre —
      // cada uma, uma vez, com o sinal daquela entrada "Total".
      const itensDeDetalhe =
        linha.origem === "modulo" && linha.valores?.length
          ? linha.valores.flatMap((item) =>
              item.codigo === TOTAL_MODULO_TOKEN
                ? codigosDoTotal(linha.moduloId, item.sinal, contexto.visao, contexto.filiais, contexto.centrosPermitidos)
                : [item]
            )
          : [];

      const detalhe = itensDeDetalhe.length
        ? itensDeDetalhe.map((item) => {
            const serie = montarSerie((metrica, mes) =>
              valorDoCodigoSeguro(linha.moduloId, item.codigo, item.sinal, contexto, metrica, mes)
            );
            return {
              codigo: item.codigo,
              descricao: catalogo?.porCodigo?.get(item.codigo)?.descricao ?? item.codigo,
              sinal: item.sinal ?? 1,
              ...serie,
            };
          })
        : null;

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
        // Linha "modulo" marcada "subtrai" já é despesa por definição — o
        // "-" na frente do número é redundante, não um alerta (isso é
        // diferente de um valor que virou negativo por acidente, tipo uma
        // receita com devolução maior que a venda, que continua mostrando
        // o sinal). Os NÚMEROS aqui continuam com o sinal de verdade —
        // isto é só um aviso pra tela formatar como valor absoluto.
        mostrarAbsoluto: linha.origem === "modulo" && linha.sinal === -1,
        meses: porMes,
        total,
        detalhe,
      };
    });
}
