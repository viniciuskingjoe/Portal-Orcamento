// ============================================================================
// PLANO DE CONTAS (classificações da visão contábil)
//
// Vem inteiro de /api/contas. Este módulo só indexa e navega o que a API mandou.
//
// Cada item: { codigo, descricao, totalizaEm, sintetica }
//   codigo      "3.1.1.1.02"
//   sintetica   true nos grupos (3.1, 3.1.1); false nas folhas, que recebem
//               lançamento
//   totalizaEm  para onde o valor totaliza no DRE — NÃO é o pai da árvore
//
// A ÁRVORE SE MONTA PELO PREFIXO DO CÓDIGO, não por `totalizaEm`. No ERP
// "3.1.1.3" totaliza em "3.1.2", mas na estrutura é filho de "3.1.1". Usar
// `totalizaEm` como pai jogaria ramos inteiros para o lugar errado.
// ============================================================================

export const CATALOGO_VAZIO = { lista: [], porCodigo: new Map(), filhos: new Map(), raizes: [] };

export function paiDaClassificacao(codigo) {
  const corte = codigo.lastIndexOf(".");
  return corte < 0 ? null : codigo.slice(0, corte);
}

// A árvore do ERP tem buracos: na visão 25 existe "4.1.2.01" mas não "4.1.2".
// Sobe até achar um ancestral que exista, senão "4.1.2.01" viraria raiz e
// apareceria no mesmo nível de "3.1".
function ancestralExistente(porCodigo, codigo) {
  let pai = paiDaClassificacao(codigo);
  while (pai != null) {
    if (porCodigo.has(pai)) return pai;
    pai = paiDaClassificacao(pai);
  }
  return null;
}

export function indexarContas(bruto) {
  const lista = bruto ?? [];
  const porCodigo = new Map(lista.map((conta) => [conta.codigo, conta]));

  const filhos = new Map();
  const raizes = [];

  lista.forEach((conta) => {
    const pai = ancestralExistente(porCodigo, conta.codigo);
    if (pai != null) {
      if (!filhos.has(pai)) filhos.set(pai, []);
      filhos.get(pai).push(conta.codigo);
    } else {
      // Raiz de verdade: nenhum ancestral no catálogo. Na visão 25 são 3.1, 4.1,
      // 4.2, 4.3, 4.4, 4.5, 4.6 e 4.7 — o nó "3"/"4" não existe.
      raizes.push(conta.codigo);
    }
  });

  return { lista, porCodigo, filhos, raizes };
}

export function conta(catalogo, codigo) {
  return catalogo.porCodigo.get(codigo) ?? null;
}

export function temFilhos(catalogo, codigo) {
  return (catalogo.filhos.get(codigo) ?? []).length > 0;
}

// Linhas a desenhar na árvore, já achatadas: só descem os nós abertos.
// Achatar aqui evita recursão em componente e mantém a lista estável para o React.
export function linhasDaArvore(catalogo, expandidos) {
  const linhas = [];
  const visitar = (codigo, nivel) => {
    const item = catalogo.porCodigo.get(codigo);
    if (!item) return;
    const filhos = catalogo.filhos.get(codigo) ?? [];
    const aberto = expandidos.has(codigo);
    linhas.push({ ...item, nivel, temFilhos: filhos.length > 0, aberto });
    if (aberto) filhos.forEach((filho) => visitar(filho, nivel + 1));
  };
  catalogo.raizes.forEach((raiz) => visitar(raiz, 0));
  return linhas;
}

// Ancestrais que existem no catálogo, da raiz para baixo. Usado para abrir o
// caminho até uma conta já selecionada.
export function ancestrais(catalogo, codigo) {
  const caminho = [];
  let atual = ancestralExistente(catalogo.porCodigo, codigo);
  while (atual != null) {
    caminho.unshift(atual);
    atual = ancestralExistente(catalogo.porCodigo, atual);
  }
  return caminho;
}

// Um grupo não recebe lançamento; o movimento fica nas folhas. Marcar o grupo em
// um módulo tem que valer pelos descendentes, senão o total daria zero.
//
// Devolve Set para o caso de grupo e folha marcados ao mesmo tempo: sem isso o
// valor da folha entraria duas vezes.
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
