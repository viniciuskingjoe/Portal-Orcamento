import { SEM_CENTRO } from "./visao.js";

// ============================================================================
// REALIZADO
//
// Vem de /api/realizado: uma linha por classificação × filial × centro de custo
// × mês, com débito e crédito já com o rateio de centro aplicado e sem os
// lançamentos de encerramento/apuração.
// ============================================================================

export const REALIZADO_VAZIO = { porChave: new Map(), porContaFilialMes: new Map() };

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

  (bruto ?? []).forEach((linha) => {
    const centro = linha.centro ?? SEM_CENTRO;
    acumular(porChave, `${linha.classificacao}|${linha.filial}|${centro}|${linha.mes}`, linha);
    acumular(porContaFilialMes, `${linha.classificacao}|${linha.filial}|${linha.mes}`, linha);
  });

  return { porChave, porContaFilialMes };
}

// O sinal é da CONTA, não do módulo.
//
// Um módulo de despesa pode conter contas de receita — "Outras despesas" tem
// RECEITAS COM ATUALIZAÇÕES, JUROS OBTIDOS, OUTRAS RECEITAS OPERACIONAIS. Lê-las
// como despesa inverteria o sinal delas no total.
//
// O critério é o LX_GRUPO_CONTABIL: R é receita, DV e DF são despesa. Isso
// reproduz sozinho 17 das 19 contas que o ERP trata como receita dentro de
// Outras despesas. As outras 2 (4.6.5.01 INDENIZAÇÃO DE SEGUROS e 4.6.5.02
// OUTRAS RECEITAS) estão marcadas DF no ERP apesar de serem receita — para essas
// existe `inverter`, a lista de exceções da visão.
export function tipoDaConta(catalogo, codigo, tipoPadrao, inverter) {
  const grupo = catalogo?.porCodigo?.get(codigo)?.grupo;
  const base = grupo ? (grupo === "R" ? "receita" : "despesa") : tipoPadrao;
  if (!inverter?.has?.(codigo)) return base;
  return base === "receita" ? "despesa" : "receita";
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
  inverter,
}) {
  if (!indice) return 0;
  const semCentro = !centroId || centroId === SEM_CENTRO;
  const mapa = semCentro ? indice.porContaFilialMes : indice.porChave;

  let total = 0;
  (contas ?? []).forEach((conta) => {
    const tipo = tipoDaConta(catalogo, conta, tipoPadrao, inverter);
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
