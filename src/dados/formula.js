// ============================================================================
// FÓRMULA DE CONTA CALCULADA (Despesas com pessoal)
//
// Uma conta calculada não recebe valor digitado: o valor sai de uma expressão
// que referencia outras contas do MESMO módulo, formato V[classificacao] —
// ex.: "(V[4.2.1.10.001] + V[4.2.1.10.002]) / 12" para um 13º salário que soma
// salário e abono e divide por doze.
//
// Interpretador próprio, não `eval`/`Function`: a expressão é texto digitado
// por quem configura a visão, e o SERVIDOR também avalia isto na publicação
// para o Linx — rodar como JavaScript de verdade abriria espaço para código
// arbitrário vindo de um campo de formulário.
//
// Este módulo só entende a EXPRESSÃO. Não sabe o que é filial, centro, mês ou
// referência circular — isso é contexto de dados/plano.js, que chama
// `avaliarFormula` de novo para cada conta calculada que aparece dentro de
// outra, e é o único lugar que sabe o suficiente (filial+centro+conta+mês)
// para dizer com segurança "isto já estava sendo calculado".
// ============================================================================

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|(V\[[^\]]*\])|([()+\-*/]))/y;

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
    else if (casado[2] != null) tokens.push({ tipo: "conta", codigo: casado[2].slice(2, -1).trim() });
    else if (casado[3] != null) tokens.push({ tipo: casado[3] });

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
    if (atual.tipo === "conta") {
      if (!atual.codigo) throw new Error("V[] precisa do código de uma conta dentro dos colchetes.");
      indice += 1;
      return { tipo: "conta", codigo: atual.codigo };
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

function avaliarNo(no, resolverConta) {
  switch (no.tipo) {
    case "numero":
      return no.valor;
    case "conta":
      return resolverConta(no.codigo);
    case "negativo":
      return -avaliarNo(no.valor, resolverConta);
    case "+":
      return avaliarNo(no.esquerda, resolverConta) + avaliarNo(no.direita, resolverConta);
    case "-":
      return avaliarNo(no.esquerda, resolverConta) - avaliarNo(no.direita, resolverConta);
    case "*":
      return avaliarNo(no.esquerda, resolverConta) * avaliarNo(no.direita, resolverConta);
    case "/": {
      const divisor = avaliarNo(no.direita, resolverConta);
      if (!divisor) throw new Error("A fórmula tem uma divisão por zero.");
      return avaliarNo(no.esquerda, resolverConta) / divisor;
    }
    default:
      throw new Error(`Nó de fórmula desconhecido: "${no.tipo}".`);
  }
}

// `resolverConta(codigo)` devolve o valor em reais daquela conta no mesmo
// contexto (filial, centro, mês) da fórmula — quem chama decide o que isso
// significa (conta fixa lida do planejado, ou outra calculada resolvida de
// novo) e é responsável por travar referência circular, porque só ele conhece
// a chave completa da célula.
export function avaliarFormula(expressao, resolverConta) {
  return avaliarNo(analisarFormula(expressao), resolverConta);
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
