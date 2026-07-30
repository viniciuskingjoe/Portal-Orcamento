import { SEM_CENTRO } from "./visao.js";

// ============================================================================
// REALIZADO
//
// Vem de /api/realizado: uma linha por classificação × filial × centro de custo
// × mês, com débito e crédito já com sinal do OPERADOR e rateio da PORCENTAGEM
// aplicados, e sem os lançamentos de encerramento do exercício.
// ============================================================================

export const REALIZADO_VAZIO = { porChave: new Map(), porContaFilialMes: new Map() };

function acumular(mapa, chave, linha) {
  const atual = mapa.get(chave) ?? { debito: 0, credito: 0 };
  mapa.set(chave, {
    debito: atual.debito + Number(linha.debito ?? 0),
    credito: atual.credito + Number(linha.credito ?? 0),
  });
}

// Dois índices: um com centro de custo e outro somando todos os centros.
// O segundo evita varrer a lista de centros quando o módulo não usa essa
// dimensão — que é o caso da maioria.
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

// Receita cresce a crédito, despesa a débito. Devolver sempre positivo para o
// que "aconteceu" deixa a coluna comparável com o planejado, que é sempre
// positivo — e a variação passa a significar a mesma coisa nos dois casos.
function valor({ debito, credito }, tipo) {
  return tipo === "receita" ? credito - debito : debito - credito;
}

export function somarRealizado({ indice, contas, filiais, centroId, mes, tipo }) {
  if (!indice) return 0;
  const semCentro = !centroId || centroId === SEM_CENTRO;
  const mapa = semCentro ? indice.porContaFilialMes : indice.porChave;

  let total = 0;
  (contas ?? []).forEach((conta) => {
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
