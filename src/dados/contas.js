// ============================================================================
// PLANO DE CONTAS
//
// Vem inteiro de /api/contas (dbo.CTB_VISAO, visão contábil orçamentária). Não
// há lista fixa aqui — este módulo só indexa e navega o que a API devolveu.
//
// Cada item: { codigo, descricao, totalizaEm, sintetica }
//   codigo      "3.1.1.1.02"
//   totalizaEm  "3.1.1.1"     o pai na hierarquia
// ============================================================================

export const CATALOGO_VAZIO = { lista: [], porCodigo: new Map(), filhos: new Map() };

// O nível vem da quantidade de segmentos do código: "3" -> 0, "3.1.1.1.02" -> 4.
// Serve para indentar a árvore sem precisar percorrer `totalizaEm` em cascata.
export function indexarContas(bruto) {
  const lista = (bruto ?? []).map((conta) => ({
    ...conta,
    nivel: conta.codigo.split(".").length - 1,
  }));

  const porCodigo = new Map(lista.map((conta) => [conta.codigo, conta]));

  const filhos = new Map();
  lista.forEach((conta) => {
    if (!conta.totalizaEm) return;
    if (!filhos.has(conta.totalizaEm)) filhos.set(conta.totalizaEm, []);
    filhos.get(conta.totalizaEm).push(conta.codigo);
  });

  return { lista, porCodigo, filhos };
}

export function conta(catalogo, codigo) {
  return catalogo.porCodigo.get(codigo) ?? null;
}

// Uma classificação sintética (ex. "3.1.1.1 VENDA DE MERCADORIA") não recebe
// lançamento: o movimento fica nas folhas. Selecionar o pai em um módulo tem que
// valer pelos descendentes, senão o total daria zero.
//
// Devolve um Set para o caso de pai e filho estarem selecionados ao mesmo tempo:
// sem isso o valor do filho entraria duas vezes.
export function expandirComDescendentes(catalogo, codigos) {
  const resultado = new Set();
  const visitar = (codigo) => {
    if (resultado.has(codigo)) return;
    resultado.add(codigo);
    (catalogo.filhos.get(codigo) ?? []).forEach(visitar);
  };
  (codigos ?? []).forEach(visitar);
  return resultado;
}
