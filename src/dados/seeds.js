// Dimensões iniciais de um plano novo.
//
// `fator` é parâmetro do mock determinístico: uma filial criada pela tela nasce
// com 0 e fica coerente (planejado 0 e realizado 0). Sai quando o banco entrar.

export const EMPRESA = "KING & JOE CONFECCOES LTDA";

export const FILIAIS_SEED = [
  { id: "akr", nome: "AKR Brands", fator: 1.08 },
  { id: "menhub", nome: "MenHUB", fator: 0.82 },
  { id: "loja", nome: "Loja", fator: 0.64 },
];

export const CENTROS_SEED = [
  { id: "administrativo", nome: "ADMINISTRATIVO" },
  { id: "comercial", nome: "COMERCIAL" },
  { id: "financeiro", nome: "FINANCEIRO" },
  { id: "controladoria", nome: "CONTROLADORIA" },
];

// Visão de exemplo, para o portal não abrir vazio. Receita de vendas e
// Deduções de vendas já vêm com contas; os demais módulos ficam a configurar.
export const VISOES_SEED = [
  {
    id: "dre-2025",
    nome: "DRE 2025",
    modulos: {
      "receita-vendas": ["3.1.1.01.001", "3.1.1.01.002", "3.1.1.01.003", "3.1.1.05.001"],
      "receitas-nao-operacionais": ["3.1.1.01.006"],
      "deducoes-vendas": ["3.1.9.01.001", "3.1.9.02.001", "3.1.9.02.002", "3.1.9.02.003"],
    },
  },
];

export const CONFIGURACOES = ["filiais", "centros"];

export const MESES = Array.from({ length: 12 }, (_, index) => index + 1);
