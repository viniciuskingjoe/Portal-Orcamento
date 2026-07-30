import { SEM_CENTRO } from "./visao.js";
import { correcaoDeSinal } from "./mapeamentoPadrao.js";

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
  filiais: new Set(),
};

function acumular(mapa, chave, linha) {
  const atual = mapa.get(chave) ?? { debito: 0, credito: 0 };
  mapa.set(chave, {
    debito: atual.debito + Number(linha.debito ?? 0),
    credito: atual.credito + Number(linha.credito ?? 0),
  });
}

// Dois índices: um com centro de custo e outro somando todos os centros. O
// segundo evita varrer a lista de centros quando o módulo não usa essa dimensão.
export function indexarRealizado(bruto) {
  const porChave = new Map();
  const porContaFilialMes = new Map();
  // Filiais que têm movimento no período. Serve para avisar quando alguma delas
  // está fora das filiais em uso — o total da tela sairia menor sem explicação.
  const filiais = new Set();

  (bruto ?? []).forEach((linha) => {
    const centro = linha.centro ?? SEM_CENTRO;
    acumular(porChave, `${linha.classificacao}|${linha.filial}|${centro}|${linha.mes}`, linha);
    acumular(porContaFilialMes, `${linha.classificacao}|${linha.filial}|${linha.mes}`, linha);
    filiais.add(linha.filial);
  });

  return { porChave, porContaFilialMes, filiais };
}

// Filiais com movimento que estão fora da lista em uso.
export function filiaisForaDoUso(indice, filiaisEmUso) {
  const emUso = new Set((filiaisEmUso ?? []).map((filial) => filial.id));
  return [...(indice?.filiais ?? [])].filter((id) => !emUso.has(id)).sort();
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
}) {
  if (!indice) return 0;
  const semCentro = !centroId || centroId === SEM_CENTRO;
  const mapa = semCentro ? indice.porContaFilialMes : indice.porChave;

  let total = 0;
  (contas ?? []).forEach((conta) => {
    const tipo = tipoDaConta(catalogo, conta, tipoPadrao, { sinais, visaoContabil });
    (filiais ?? []).forEach((filial) => {
      const chave = semCentro
        ? `${conta}|${filial.id}|${mes}`
        : `${conta}|${filial.id}|${centroId}|${mes}`;
      const linha = mapa.get(chave);
      if (linha) total += valor(linha, tipo);
    });
  });
  return total;
}
