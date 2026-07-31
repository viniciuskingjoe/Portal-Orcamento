import { SEM_CENTRO } from "./visao.js";
import { correcaoDeSinal, receitaDoCentro } from "./mapeamentoPadrao.js";

// ============================================================================
// REALIZADO
//
// Vem de /api/realizado: uma linha por classificação × filial × centro de custo
// × mês, com débito e crédito já com o rateio de centro aplicado e sem os
// lançamentos de encerramento/apuração.
// ============================================================================

export const REALIZADO_VAZIO = {
  porChave: new Map(),
  porContaFilialMes: new Map(),
  porReceita: new Map(),
  filiais: new Set(),
};

function acumular(mapa, chave, linha) {
  const atual = mapa.get(chave) ?? { debito: 0, credito: 0 };
  mapa.set(chave, {
    debito: atual.debito + Number(linha.debito ?? 0),
    credito: atual.credito + Number(linha.credito ?? 0),
  });
}

// Três índices sobre as mesmas linhas:
//
//   porChave           conta | filial | centro | mês
//   porContaFilialMes  conta | filial | mês      — evita varrer os centros nos
//                                                  módulos que não usam a dimensão
//   porReceita         conta | filial | receita | mês
//
// O terceiro existe porque o razão não diz de qual receita é uma devolução: a
// atribuição vem do centro de custo (ver dados/mapeamentoPadrao.js). Resolver
// isso na indexação, e não na soma, evita reabrir o mapa a cada célula.
export function indexarRealizado(bruto, visaoContabil = null) {
  const porChave = new Map();
  const porContaFilialMes = new Map();
  const porReceita = new Map();
  // Filiais que têm movimento no período. Serve para avisar quando alguma delas
  // está fora das filiais em uso — o total da tela sairia menor sem explicação.
  const filiais = new Set();

  (bruto ?? []).forEach((linha) => {
    const centro = linha.centro ?? SEM_CENTRO;
    acumular(porChave, `${linha.classificacao}|${linha.filial}|${centro}|${linha.mes}`, linha);
    acumular(porContaFilialMes, `${linha.classificacao}|${linha.filial}|${linha.mes}`, linha);

    const receita = receitaDoCentro(visaoContabil, centro);
    if (receita) {
      acumular(porReceita, `${linha.classificacao}|${linha.filial}|${receita}|${linha.mes}`, linha);
    }
    filiais.add(linha.filial);
  });

  return { porChave, porContaFilialMes, porReceita, filiais };
}

// Filiais com movimento que estão fora da lista em uso.
//
// Recebe TODOS os índices em tela — o do ano e o do anterior. Uma filial pode ter
// movimento só no ano anterior (a 000004 fechou 2025 com 49.080,58 e não teve
// nada em 2026) e ainda assim mudar a coluna comparativa. Olhar só o ano do
// plano deixaria a diferença sem explicação.
export function filiaisForaDoUso(indices, filiaisEmUso) {
  const emUso = new Set((filiaisEmUso ?? []).map((filial) => filial.id));
  const comMovimento = new Set();

  (Array.isArray(indices) ? indices : [indices]).forEach((indice) => {
    (indice?.filiais ?? []).forEach((id) => comMovimento.add(id));
  });

  return [...comMovimento].filter((id) => !emUso.has(id)).sort();
}

// O sinal é da CONTA, não do módulo, e sai de três camadas nesta ordem:
//
//   1. `sinais` — o que o usuário definiu na visão, conta a conta. Ganha de tudo.
//   2. correção conhecida — conta que é receita mas está cadastrada como DF no
//      ERP. Aplica sozinha, sem ninguém marcar nada.
//   3. LX_GRUPO_CONTABIL da conta — R é receita, DV e DF são despesa.
//
// Sem isso, um módulo de despesa que contém contas de receita (JUROS OBTIDOS,
// OUTRAS RECEITAS OPERACIONAIS) inverteria o sinal delas no total.
export function tipoDaConta(catalogo, codigo, tipoPadrao, contexto = {}) {
  const { sinais, visaoContabil } = contexto;

  const definido = sinais?.[codigo];
  if (definido === "receita" || definido === "despesa") return definido;

  const corrigido = correcaoDeSinal(visaoContabil, codigo);
  if (corrigido) return corrigido;

  const grupo = catalogo?.porCodigo?.get(codigo)?.grupo;
  return grupo ? (grupo === "R" ? "receita" : "despesa") : tipoPadrao;
}

// Receita cresce a crédito, despesa a débito. Devolver sempre positivo para o
// que "aconteceu" deixa a coluna comparável com o planejado, que é sempre
// positivo — e a variação passa a significar a mesma coisa nos dois casos.
function valor({ debito, credito }, tipo) {
  return tipo === "receita" ? credito - debito : debito - credito;
}

// `receitas` recorta o realizado pelas contas de receita selecionadas. Vazio ou
// ausente = a conta contábil inteira, que é o que "Todas as receitas" deve
// mostrar — a soma das receitas mapeadas dá exatamente o mesmo, e não filtrar
// evita perder movimento de um centro que a visão não tenha configurado.
export function somarRealizado({
  indice,
  catalogo,
  contas,
  filiais,
  centroId,
  mes,
  tipoPadrao,
  sinais,
  visaoContabil,
  receitas,
}) {
  if (!indice) return 0;
  const semCentro = !centroId || centroId === SEM_CENTRO;
  const filtraReceita = Array.isArray(receitas) && receitas.length > 0;

  // Com um centro escolhido a receita já está determinada — o mapa é
  // centro → receita. Filtrar pelos dois seria redundante: ou o centro é
  // daquela receita, ou não há o que somar.
  if (!semCentro && filtraReceita && !receitas.includes(receitaDoCentro(visaoContabil, centroId))) {
    return 0;
  }

  const porReceita = semCentro && filtraReceita;
  const mapa = porReceita
    ? indice.porReceita
    : semCentro
      ? indice.porContaFilialMes
      : indice.porChave;

  let total = 0;
  (contas ?? []).forEach((conta) => {
    const tipo = tipoDaConta(catalogo, conta, tipoPadrao, { sinais, visaoContabil });
    (filiais ?? []).forEach((filial) => {
      const chaves = porReceita
        ? receitas.map((receita) => `${conta}|${filial.id}|${receita}|${mes}`)
        : [semCentro ? `${conta}|${filial.id}|${mes}` : `${conta}|${filial.id}|${centroId}|${mes}`];

      chaves.forEach((chave) => {
        const linha = mapa.get(chave);
        if (linha) total += valor(linha, tipo);
      });
    });
  });
  return total;
}
