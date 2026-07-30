import { contasEfetivas } from "./contas.js";

// ============================================================================
// REALIZADO
//
// Vem de /api/realizado: uma linha por classificação × filial × mês, com débito
// e crédito já com sinal do OPERADOR e rateio da PORCENTAGEM aplicados.
// ============================================================================

export const REALIZADO_VAZIO = new Map();

export function indexarRealizado(bruto) {
  const indice = new Map();
  (bruto ?? []).forEach((linha) => {
    const chave = `${linha.classificacao}|${linha.filial}|${linha.mes}`;
    const atual = indice.get(chave) ?? { debito: 0, credito: 0 };
    indice.set(chave, {
      debito: atual.debito + Number(linha.debito ?? 0),
      credito: atual.credito + Number(linha.credito ?? 0),
    });
  });
  return indice;
}

// Receita cresce a crédito, despesa a débito. Devolver sempre positivo para o
// que "aconteceu" deixa a coluna comparável com o planejado, que é sempre
// positivo — e a variação passa a significar a mesma coisa nos dois casos.
function valor({ debito, credito }, tipo) {
  return tipo === "receita" ? credito - debito : debito - credito;
}

export function somarRealizado({ indice, catalogo, classificacoes, filiais, mes, tipo, grupo }) {
  // A seleção é explícita (cascata na tela), então aqui não há expansão: soma-se
  // exatamente o que está marcado, recortado pelo grupo contábil do módulo.
  const codigos = contasEfetivas(catalogo, classificacoes, grupo);
  let total = 0;
  codigos.forEach((codigo) => {
    filiais.forEach((filial) => {
      const linha = indice.get(`${codigo}|${filial.id}|${mes}`);
      if (linha) total += valor(linha, tipo);
    });
  });
  return total;
}
