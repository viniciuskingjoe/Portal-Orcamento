// ============================================================================
// MAPEAMENTO PADRÃO (visão contábil 25)
//
// Faixas de conta que o Scoreplan usa em cada módulo. Serve como ponto de
// partida ao montar uma visão: aplica-se e depois ajusta-se conta a conta.
//
// NÃO é regra do sistema — a visão continua sendo escolha de quem monta. Um
// plano pode querer um recorte diferente, e é para isso que a visão existe.
//
// `contas` lista códigos exatos; `prefixos` pega tudo abaixo do prefixo. Dois
// módulos ficam de fora porque o Scoreplan não tem equivalente: Receitas não
// operacionais e Despesas com pessoal.
// ============================================================================

export const VISAO_CONTABIL_PADRAO = "25";

export const MAPEAMENTO_PADRAO = {
  "receita-vendas": {
    // Lista fechada, não faixa: o Scoreplan deixa de fora 3.1.1.01.005
    // (mostruário), 3.1.1.01.060 (fabricação por encomenda) e 3.1.1.05.001
    // (lojas), que existem na visão 25.
    contas: [
      "3.1.1.01.001",
      "3.1.1.01.002",
      "3.1.1.01.003",
      "3.1.1.01.004",
      "3.1.1.01.006",
      "3.1.1.01.007",
      "3.1.1.01.050",
      "3.1.1.01.051",
      "3.1.1.01.052",
      "3.1.1.02.001",
      "3.1.1.02.002",
    ],
  },
  "deducoes-vendas": { prefixos: ["3.1.2."] },
  "custos-variaveis": {
    prefixos: ["4.1.1.", "4.1.2.", "4.1.3.", "4.1.5.", "4.1.6.", "4.1.7."],
  },
  "despesas-variaveis": { prefixos: ["4.1.8.", "4.1.9."] },
  "despesas-operacionais": {
    prefixos: ["4.2.1.", "4.3.1.", "4.4.1.", "4.4.2.", "4.4.3."],
  },
  "outras-despesas": {
    prefixos: [
      "4.4.4.",
      "4.4.5.",
      "4.5.1.",
      "4.5.2.",
      "4.5.3.",
      "4.6.1.",
      "4.6.3.",
      "4.6.5.",
      "4.6.8.",
      "4.7.1.",
    ],
  },
};

// Contas do ERP que o Scoreplan lê como receita mesmo estando em LX_GRUPO_CONTABIL
// = DF. São receitas classificadas como despesa no cadastro; sem a exceção o
// sinal delas sai invertido.
export const INVERSOES_PADRAO = ["4.6.5.01", "4.6.5.02"];

export function temMapeamentoPadrao(visaoContabil) {
  return visaoContabil === VISAO_CONTABIL_PADRAO;
}

// Só folhas: sintética não recebe lançamento e a tela do plano não a oferece.
export function contasDoMapeamento(catalogo, moduloId) {
  const regra = MAPEAMENTO_PADRAO[moduloId];
  if (!regra) return [];

  return catalogo.lista
    .filter((item) => {
      if (item.sintetica !== false) return false;
      if (regra.contas) return regra.contas.includes(item.codigo);
      return regra.prefixos.some((prefixo) => item.codigo.startsWith(prefixo));
    })
    .map((item) => item.codigo);
}

// Inversões que valem para as contas realmente presentes no catálogo.
export function inversoesDoMapeamento(catalogo) {
  const dentro = new Set();
  catalogo.lista.forEach((item) => {
    if (INVERSOES_PADRAO.some((prefixo) => item.codigo.startsWith(prefixo))) {
      dentro.add(item.codigo);
    }
  });
  return [...dentro];
}
