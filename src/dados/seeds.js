// Dimensões iniciais de um plano novo.
//
// Cada item carrega os parâmetros que alimentam o mock determinístico
// (`fator`, `bases`, `percentualBase`). Isso é intencional: os geradores leem
// esses números do próprio item, então uma filial/canal criado pela tela nasce
// com parâmetro 0 e fica coerente — planejado 0 E realizado 0.
//
// Ao plugar o banco, estes campos saem e os geradores viram consultas.

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

export const CANAIS_SEED = [
  {
    id: "atacado",
    nome: "ATACADO",
    contas: ["3.1.1.01.001", "3.1.1.01.002", "3.1.1.01.003"],
    bases: { vendas: 1850000, operacionais: 172000 },
  },
  {
    id: "varejo",
    nome: "VAREJO / LOJAS",
    contas: ["3.1.1.05.001", "3.1.1.01.052"],
    bases: { vendas: 1040000, operacionais: 108000 },
  },
  {
    id: "ecommerce",
    nome: "E-COMMERCE",
    contas: ["3.1.1.01.004"],
    bases: { vendas: 670000, operacionais: 76000 },
  },
  {
    id: "mercado-externo",
    nome: "MERCADO EXTERNO",
    contas: ["3.1.1.01.050", "3.1.1.01.051", "3.1.1.02.002"],
    bases: { vendas: 0, operacionais: 0 },
  },
];

export const DEDUCOES_SEED = [
  {
    id: "devolucoes",
    nome: "DEVOLUÇÕES",
    contas: ["3.1.9.01.001", "3.1.9.01.002"],
    percentualBase: 2.35,
  },
  {
    id: "impostos",
    nome: "IMPOSTOS SOBRE VENDAS",
    contas: ["3.1.9.02.001", "3.1.9.02.002", "3.1.9.02.003"],
    percentualBase: 10.82,
  },
];

export const MODULOS = {
  filiais: { titulo: "Filiais", tipo: "config", icone: "building" },
  centros: { titulo: "Centro de Custos", tipo: "config", icone: "layers" },
  canais: { titulo: "Canais", tipo: "config", icone: "route" },
  // Rótulo é "Despesas"; o id continua `deducao` porque é o que está gravado
  // nos planos salvos e nas chaves de percentual.
  deducao: { titulo: "Despesas", tipo: "config", icone: "percent" },
  vendas: { titulo: "Receita de Vendas", tipo: "receita", icone: "chart" },
  operacionais: { titulo: "Receitas Operacionais", tipo: "receita", icone: "coins" },
  deducaoVendas: { titulo: "Dedução de Vendas", tipo: "despesa", icone: "trendingDown" },
};

export const MODULOS_CONFIG = ["filiais", "centros", "canais", "deducao"];
export const MODULOS_ORCAMENTO = ["vendas", "operacionais", "deducaoVendas"];

export const MESES = Array.from({ length: 12 }, (_, index) => index + 1);
