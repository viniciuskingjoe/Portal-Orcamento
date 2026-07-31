import { modulo as definicaoDoModulo } from "./modulos.js";
import { moduloConfigurado } from "./visao.js";
import { totaisDoModuloNoAno } from "./plano.js";

// ============================================================================
// DRE CONSOLIDADO
//
// A ordem em que os 8 módulos fecham o resultado. Cada módulo aparece UMA vez,
// com o sinal com que entra na conta, e cada subtotal é a soma acumulada de tudo
// que veio acima dele — por isso não há lista de parcelas para manter em dia:
// mexeu na ordem, os subtotais acompanham.
//
// Os valores dos módulos são sempre positivos (ver dados/realizado.js), então o
// sinal vive aqui e aparece no rótulo, como em qualquer DRE.
// ============================================================================

export const ESTRUTURA_DRE = [
  { modulo: "receita-vendas", sinal: 1 },
  { modulo: "deducoes-vendas", sinal: -1 },
  { subtotal: "receita-liquida", titulo: "Receita líquida" },

  { modulo: "custos-variaveis", sinal: -1 },
  { subtotal: "margem-bruta", titulo: "Margem bruta" },

  { modulo: "despesas-variaveis", sinal: -1 },
  { subtotal: "margem-contribuicao", titulo: "Margem de contribuição" },

  { modulo: "despesas-operacionais", sinal: -1 },
  { modulo: "despesas-pessoal", sinal: -1 },
  { subtotal: "resultado-operacional", titulo: "Resultado operacional" },

  { modulo: "receitas-nao-operacionais", sinal: 1 },
  { modulo: "outras-despesas", sinal: -1 },
  { subtotal: "resultado-liquido", titulo: "Resultado líquido", destaque: true },
];

// A linha que serve de base para a análise vertical. Receita líquida, não
// bruta: é sobre ela que margem e despesa se medem.
const BASE_VERTICAL = "receita-liquida";

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

// Monta as linhas do DRE. `filiais` é o recorte em tela — "Total" manda todas as
// em uso, uma filial específica manda só ela.
export function montarDre({ plano, visao, filiais, catalogo, realizado, realizadoAnterior }) {
  const acumulado = { planejado: 0, realizado: 0, anterior: 0 };
  const linhas = [];
  let base = null;

  ESTRUTURA_DRE.forEach((item) => {
    if (item.subtotal) {
      const linha = {
        id: item.subtotal,
        titulo: item.titulo,
        tipo: "subtotal",
        destaque: item.destaque === true,
        ...acumulado,
        ...variacao(acumulado.realizado, acumulado.anterior),
      };
      if (item.subtotal === BASE_VERTICAL) base = { ...acumulado };
      linhas.push(linha);
      return;
    }

    const definicao = definicaoDoModulo(item.modulo);
    if (!definicao) return;

    const totais = totaisDoModuloNoAno({
      plano,
      visao,
      moduloId: item.modulo,
      filiais,
      catalogo,
      realizado,
      realizadoAnterior,
    });

    acumulado.planejado += totais.planejado * item.sinal;
    acumulado.realizado += totais.realizado * item.sinal;
    acumulado.anterior += totais.anterior * item.sinal;

    linhas.push({
      id: item.modulo,
      titulo: definicao.titulo,
      tipo: "modulo",
      moduloId: item.modulo,
      sinal: item.sinal,
      configurado: moduloConfigurado(visao, item.modulo),
      ...totais,
      ...variacao(totais.realizado, totais.anterior),
    });
  });

  // A participação só é calculada depois, porque a receita líquida está no meio
  // da lista e as linhas acima dela também precisam dela.
  return linhas.map((linha) => ({
    ...linha,
    participacaoPlanejado: participacao(linha.planejado, base?.planejado ?? 0),
    participacaoRealizado: participacao(linha.realizado, base?.realizado ?? 0),
  }));
}
