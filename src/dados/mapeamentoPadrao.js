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

// ============================================================================
// CORREÇÕES DE SINAL
//
// Contas que são receita mas estão cadastradas com LX_GRUPO_CONTABIL = DF no
// ERP. Sem corrigir, o sinal delas sai invertido — é o que o Scoreplan resolve
// com um CASE de prefixos.
//
// Valem por visão contábil e por prefixo de classificação, e são aplicadas
// sozinhas: não dependem de ninguém marcar nada. Quando o cadastro do ERP for
// corrigido, basta apagar a entrada daqui.
//
// A visão ainda pode sobrepor conta a conta — o que o usuário define ganha
// destas correções.
// ============================================================================

export const CORRECOES_DE_SINAL = {
  25: [
    // 4.6.5.01 INDENIZAÇÃO DE SEGUROS · 4.6.5.02 OUTRAS RECEITAS
    { prefixo: "4.6.5.01", tipo: "receita" },
    { prefixo: "4.6.5.02", tipo: "receita" },
  ],
};

export function correcaoDeSinal(visaoContabil, codigo) {
  const regras = CORRECOES_DE_SINAL[visaoContabil];
  if (!regras || !codigo) return null;
  const regra = regras.find((item) => codigo.startsWith(item.prefixo));
  return regra?.tipo ?? null;
}

// ============================================================================
// A QUE RECEITA PERTENCE O REALIZADO
//
// O razão não diz de qual receita é uma devolução ou um custo — a conta contábil
// é uma só. O Scoreplan resolve pelo CENTRO DE CUSTO:
//
//   case when CRI.CENTRO_CUSTO = '020' then '31101004'   -- e-commerce
//        else '31101001' end                             -- coleção
//
// É grosseiro: devolução de bazar, saldo e mostruário entram como coleção, e as
// outras receitas ficam sem realizado nenhum. Mas é a regra que produz os
// números do Scoreplan, e é contra eles que este portal é conferido. Corrigir a
// atribuição depende do ERP passar a marcar a receita no lançamento.
// ============================================================================

export const RECEITA_DO_REALIZADO = {
  25: {
    padrao: "3.1.1.01.001", // VENDAS DE PRODUTOS - COLEÇÃO
    porCentro: { "020": "3.1.1.01.004" }, // VENDAS DE PRODUTOS - E-COMMERCE
  },
};

export function receitaDoCentro(visaoContabil, centro) {
  const regra = RECEITA_DO_REALIZADO[visaoContabil];
  if (!regra) return null;
  return regra.porCentro[String(centro ?? "").trim()] ?? regra.padrao;
}

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

