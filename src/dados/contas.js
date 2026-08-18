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
// Recorta o catálogo para um LX_GRUPO_CONTABIL, mantendo os ancestrais dos nós
// que casam. Os ancestrais entram como estrutura (`selecionavel: false`): sem
// eles a lista perde a hierarquia e vira uma parede de códigos; com eles
// selecionáveis, marcar um pai de outro grupo puxaria contas que não são do
// módulo.
export function filtrarPorGrupo(catalogo, grupo) {
  if (!grupo) return catalogo;

  const manter = new Map();
  catalogo.lista.forEach((item) => {
    if (item.grupo !== grupo) return;
    manter.set(item.codigo, { ...item, selecionavel: true });
    ancestrais(catalogo, item.codigo).forEach((codigo) => {
      if (manter.has(codigo)) return;
      const pai = catalogo.porCodigo.get(codigo);
      if (pai) manter.set(codigo, { ...pai, selecionavel: false });
    });
  });

  // Reconstrói na ordem original do catálogo, para a árvore sair na ordem do
  // plano de contas.
  const lista = catalogo.lista
    .filter((item) => manter.has(item.codigo))
    .map((item) => manter.get(item.codigo));
  return { ...indexarContas(lista), grupo };
}

// Recorta a árvore a alguns ramos do plano de contas.
//
// O grupo contábil sozinho é largo demais para alguns módulos: "despesa fixa"
// pega de 4.1 a 4.7, e Despesas com pessoal só quer as três famílias de folha.
// Sem isto, configurar o módulo é procurar três galhos dentro da árvore inteira.
//
// Os pais dos ramos escolhidos vêm junto, não selecionáveis, para a hierarquia
// continuar legível — 441 acima de 441.01, como no plano de contas.
export function filtrarPorPrefixos(catalogo, prefixos) {
  if (!prefixos?.length) return catalogo;

  const dentro = (codigo) =>
    prefixos.some((prefixo) => codigo === prefixo || codigo.startsWith(`${prefixo}.`));

  const manter = new Map();
  catalogo.lista.forEach((item) => {
    if (!dentro(item.codigo)) return;
    manter.set(item.codigo, item);
    ancestrais(catalogo, item.codigo).forEach((codigo) => {
      if (manter.has(codigo)) return;
      const pai = catalogo.porCodigo.get(codigo);
      if (pai) manter.set(codigo, { ...pai, selecionavel: false });
    });
  });

  const lista = catalogo.lista
    .filter((item) => manter.has(item.codigo))
    .map((item) => manter.get(item.codigo));
  return { ...indexarContas(lista), grupo: catalogo.grupo };
}

// Recorta o catálogo a um conjunto exato de códigos (folhas), com os
// ancestrais junto para a árvore continuar legível. Usado pela linha do DRE:
// o recorte é sobre as contas que o MÓDULO já tem na visão (o que já foi
// configurado em cada filial/centro), não sobre o grupo contábil inteiro —
// "Deduções de vendas" e "Custos variáveis" dividem o mesmo grupo DV, então
// filtrar só pelo grupo misturaria as duas.
export function filtrarPorCodigos(catalogo, codigos) {
  if (!codigos?.length) return catalogo;

  const alvo = new Set(codigos);
  const manter = new Map();
  catalogo.lista.forEach((item) => {
    if (!alvo.has(item.codigo)) return;
    manter.set(item.codigo, { ...item, selecionavel: true });
    ancestrais(catalogo, item.codigo).forEach((codigo) => {
      if (manter.has(codigo)) return;
      const pai = catalogo.porCodigo.get(codigo);
      if (pai) manter.set(codigo, { ...pai, selecionavel: false });
    });
  });

  const lista = catalogo.lista
    .filter((item) => manter.has(item.codigo))
    .map((item) => manter.get(item.codigo));
  return { ...indexarContas(lista), grupo: catalogo.grupo };
}

// ============================================================================
// SELEÇÃO EM CASCATA
//
// Marcar um nó marca ele e todos os descendentes selecionáveis, de forma
// EXPLÍCITA: a visão guarda cada código. Assim o que está marcado na tela é
// exatamente o que a soma usa, e desmarcar uma conta isolada funciona.
//
// O preço é não acompanhar o ERP sozinho: conta nova criada dentro de um grupo já
// marcado NÃO entra na visão — alguém tem que voltar e marcá-la.
// ============================================================================

// Códigos selecionáveis da subárvore, incluindo o próprio nó. A descida continua
// por nós não selecionáveis (de outro grupo contábil), porque abaixo deles pode
// haver conta do grupo do módulo.
export function codigosDaSubarvore(catalogo, codigo) {
  const codigos = [];
  const visitados = new Set();
  const visitar = (atual) => {
    if (visitados.has(atual)) return;
    visitados.add(atual);
    const item = catalogo.porCodigo.get(atual);
    if (!item || item.selecionavel !== false) codigos.push(atual);
    (catalogo.filhos.get(atual) ?? []).forEach(visitar);
  };
  visitar(codigo);
  return codigos;
}

// Marca o nó e a subárvore dele.
export function marcarEmCascata(catalogo, marcadas, codigo) {
  const proximo = new Set(marcadas);
  codigosDaSubarvore(catalogo, codigo).forEach((item) => proximo.add(item));
  return proximo;
}

// Desmarca o nó, a subárvore dele e os ancestrais.
//
// Os ancestrais saem porque um pai marcado significa "tudo abaixo está marcado".
// Mantê-lo depois de desmarcar um filho quebraria essa leitura — e a soma
// contaria o pai como se a exclusão não existisse.
export function desmarcarEmCascata(catalogo, marcadas, codigo) {
  const proximo = new Set(marcadas);
  codigosDaSubarvore(catalogo, codigo).forEach((item) => proximo.delete(item));
  ancestrais(catalogo, codigo).forEach((pai) => proximo.delete(pai));
  return proximo;
}

// Estado de cada nó em uma passada só: quantos selecionáveis tem na subárvore
// (incluindo ele) e quantos estão marcados. Calcular por nó custaria O(n²) numa
// árvore de 680 itens.
export function resumirSelecao(catalogo, marcadas) {
  const resumo = new Map();

  const visitar = (codigo) => {
    if (resumo.has(codigo)) return resumo.get(codigo);

    const item = catalogo.porCodigo.get(codigo);
    const proprioConta = !item || item.selecionavel !== false;
    let total = proprioConta ? 1 : 0;
    let marcados = proprioConta && marcadas.has(codigo) ? 1 : 0;

    const parcial = { total, marcados };
    // Grava antes de descer para não entrar em laço se o ERP trouxer ciclo.
    resumo.set(codigo, parcial);

    (catalogo.filhos.get(codigo) ?? []).forEach((filho) => {
      const doFilho = visitar(filho);
      total += doFilho.total;
      marcados += doFilho.marcados;
    });

    parcial.total = total;
    parcial.marcados = marcados;
    return parcial;
  };

  catalogo.raizes.forEach(visitar);
  return resumo;
}

export function estadoDaSelecao(resumo, codigo) {
  const item = resumo.get(codigo);
  if (!item || item.marcados === 0) return "vazio";
  return item.marcados === item.total ? "total" : "parcial";
}

// Contas que o módulo soma: as marcadas, recortadas pelo grupo contábil.
//
// NÃO expande descendentes — a marcação já é explícita. Expandir aqui faria
// desmarcar uma conta isolada não surtir efeito no total.
export function contasEfetivas(catalogo, codigos, grupo = null) {
  const resultado = new Set();
  (codigos ?? []).forEach((codigo) => {
    const item = catalogo.porCodigo.get(codigo);
    // Código fora do catálogo é mantido: pode ser classificação que saiu do ERP,
    // e sumir com ela em silêncio esconderia o problema.
    if (!grupo || !item || item.grupo === grupo) resultado.add(codigo);
  });
  return resultado;
}
