// ============================================================================
// FÓRMULA (Despesas com pessoal e DRE)
//
// Uma conta calculada ou uma linha de DRE por fórmula não recebem valor
// digitado: o valor sai de uma expressão que referencia outra coisa —
// V[classificacao] para uma conta do plano de contas (Despesas com pessoal:
// "(V[4.2.1.10.001] + V[4.2.1.10.002]) / 12", um 13º que soma salário e abono
// e divide por doze) ou L[id] para outra linha do mesmo demonstrativo (DRE:
// "L[311]-L[312]", uma receita líquida que é receita bruta menos deduções).
//
// Interpretador próprio, não `eval`/`Function`: a expressão é texto digitado
// por quem configura a visão, e o SERVIDOR também avalia isto na publicação
// para o Linx — rodar como JavaScript de verdade abriria espaço para código
// arbitrário vindo de um campo de formulário.
//
// Este módulo só entende a EXPRESSÃO. Não sabe o que é filial, centro, mês,
// qual linha vem de qual módulo, ou referência circular — isso é contexto de
// quem chama `avaliarFormula` (dados/plano.js para V[], dados/dre.js para
// L[]), que é o único lugar que sabe o suficiente para dizer com segurança
// "isto já estava sendo calculado".
// ============================================================================

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([VL])\[([^\]]*)\]|([()+\-*/]))/y;

function tokenizar(expressao) {
  const tokens = [];
  let posicao = 0;

  while (posicao < expressao.length) {
    TOKEN.lastIndex = posicao;
    const casado = TOKEN.exec(expressao);
    if (!casado || casado[0].length === 0) {
      throw new Error(`Caractere inesperado em "${expressao.slice(posicao).trim()}".`);
    }

    if (casado[1] != null) tokens.push({ tipo: "numero", valor: Number(casado[1]) });
    else if (casado[2] != null)
      tokens.push({ tipo: "referencia", prefixo: casado[2], codigo: casado[3].trim() });
    else if (casado[4] != null) tokens.push({ tipo: casado[4] });

    posicao = TOKEN.lastIndex;
  }

  return tokens;
}

// Recursivo descendente clássico: expressão → termo (+ - termo)*,
// termo → fator (* / fator)*, fator → número | conta | (expressão) | -fator.
// A precedência vem da ordem das funções, não de tabela de precedência —
// mais simples de ler para uma gramática deste tamanho.
function analisar(tokens) {
  let indice = 0;
  const pico = () => tokens[indice];

  function fator() {
    const atual = pico();
    if (!atual) throw new Error("Fórmula incompleta.");

    if (atual.tipo === "numero") {
      indice += 1;
      return { tipo: "numero", valor: atual.valor };
    }
    if (atual.tipo === "referencia") {
      if (!atual.codigo) {
        throw new Error(`${atual.prefixo}[] precisa de um código dentro dos colchetes.`);
      }
      indice += 1;
      return { tipo: "referencia", prefixo: atual.prefixo, codigo: atual.codigo };
    }
    if (atual.tipo === "-") {
      indice += 1;
      return { tipo: "negativo", valor: fator() };
    }
    if (atual.tipo === "(") {
      indice += 1;
      const dentro = expressao();
      if (pico()?.tipo !== ")") throw new Error('Faltou fechar um "(" na fórmula.');
      indice += 1;
      return dentro;
    }
    throw new Error(`Token inesperado: "${atual.tipo}".`);
  }

  function termo() {
    let no = fator();
    while (pico()?.tipo === "*" || pico()?.tipo === "/") {
      const operador = pico().tipo;
      indice += 1;
      no = { tipo: operador, esquerda: no, direita: fator() };
    }
    return no;
  }

  function expressao() {
    let no = termo();
    while (pico()?.tipo === "+" || pico()?.tipo === "-") {
      const operador = pico().tipo;
      indice += 1;
      no = { tipo: operador, esquerda: no, direita: termo() };
    }
    return no;
  }

  const arvore = expressao();
  if (indice !== tokens.length) {
    throw new Error(`Sobrou "${tokens.slice(indice).map((t) => t.codigo ?? t.tipo).join(" ")}" depois da fórmula.`);
  }
  return arvore;
}

// AST da fórmula, ou lança com uma mensagem que dá pra mostrar direto na tela
// do editor — é o que a validação ao digitar usa, sem precisar de um resolver
// de conta.
export function analisarFormula(expressao) {
  const texto = String(expressao ?? "").trim();
  if (!texto) throw new Error("A fórmula está vazia.");
  return analisar(tokenizar(texto));
}

function avaliarNo(no, resolverReferencia) {
  switch (no.tipo) {
    case "numero":
      return no.valor;
    case "referencia":
      // O segundo argumento (prefixo) é opcional pra quem chama: Despesas com
      // pessoal só tem V[], então o resolvedor de lá nem precisa checá-lo —
      // continua funcionando exatamente como antes de existir L[].
      return resolverReferencia(no.codigo, no.prefixo);
    case "negativo":
      return -avaliarNo(no.valor, resolverReferencia);
    case "+":
      return avaliarNo(no.esquerda, resolverReferencia) + avaliarNo(no.direita, resolverReferencia);
    case "-":
      return avaliarNo(no.esquerda, resolverReferencia) - avaliarNo(no.direita, resolverReferencia);
    case "*":
      return avaliarNo(no.esquerda, resolverReferencia) * avaliarNo(no.direita, resolverReferencia);
    case "/": {
      const divisor = avaliarNo(no.direita, resolverReferencia);
      if (!divisor) throw new Error("A fórmula tem uma divisão por zero.");
      return avaliarNo(no.esquerda, resolverReferencia) / divisor;
    }
    default:
      throw new Error(`Nó de fórmula desconhecido: "${no.tipo}".`);
  }
}

// `resolverReferencia(codigo, prefixo)` devolve o valor daquela referência no
// mesmo contexto da fórmula — quem chama decide o que "V[codigo]" ou
// "L[codigo]" significam (conta do plano de contas, linha de um DRE, valor
// fixo ou recalculado) e é responsável por travar referência circular, porque
// só ele conhece a chave completa (filial+centro+conta+mês, ou visão+linha+
// mês+métrica) que identifica "isto já estava sendo calculado".
export function avaliarFormula(expressao, resolverReferencia) {
  return avaliarNo(analisarFormula(expressao), resolverReferencia);
}

// Só valida a sintaxe (sem avaliar contas) — usado pelo editor enquanto a
// pessoa digita, antes de saber se vai salvar.
export function validarFormula(expressao) {
  try {
    analisarFormula(expressao);
    return null;
  } catch (erro) {
    return erro.message;
  }
}

// Toda referência (L[]/V[]) usada numa fórmula, na ordem em que aparece —
// não avalia nada, só percorre a árvore já validada. Serve pra checar se
// alguma referência aponta pra algo que não existe (mais) sem precisar
// resolver a fórmula de verdade (achado do critique do Impeccable: fórmula
// quebrada virava 0 em silêncio, sem nenhum aviso em lugar nenhum).
export function referenciasDaFormula(expressao) {
  const referencias = [];
  function visitar(no) {
    if (!no) return;
    if (no.tipo === "referencia") {
      referencias.push({ prefixo: no.prefixo, codigo: no.codigo });
      return;
    }
    if (no.tipo === "negativo") {
      visitar(no.valor);
      return;
    }
    visitar(no.esquerda);
    visitar(no.direita);
  }
  visitar(analisarFormula(expressao));
  return referencias;
}
