const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentual = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatarMoeda(valor) {
  return moeda.format(Number.isFinite(valor) ? valor : 0);
}

export function formatarPercentual(valor) {
  return `${percentual.format(Number.isFinite(valor) ? valor : 0)}%`;
}

const SO_MILHAR = /^\d{1,3}(\.\d{3})+$/;

// Lê número no formato pt-BR.
//
// O ponto é ambíguo: em "1.234" pode ser separador de milhar (1234) ou decimal
// (1,234). A regra abaixo trata o ponto como milhar apenas quando o texto tem a
// forma de grupos de 3 dígitos. Antes, "1.850.000" era lido como 1,85.
export function parseNumeroPtBr(texto) {
  const limpo = String(texto ?? "")
    .replace(/\s| /g, "")
    .replace(/^R\$/i, "");
  if (!limpo) return 0;

  const negativo = limpo.startsWith("-");
  const corpo = negativo ? limpo.slice(1) : limpo;

  let normalizado;
  if (corpo.includes(",")) {
    // Com vírgula presente, ela é sempre o separador decimal.
    normalizado = corpo.replace(/\./g, "").replace(",", ".");
  } else if (SO_MILHAR.test(corpo)) {
    normalizado = corpo.replace(/\./g, "");
  } else {
    normalizado = corpo;
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return 0;
  return negativo ? -numero : numero;
}

// Valor que aparece dentro do input ao começar a editar: sem separador de
// milhar (para não colidir com a leitura acima) e sem zeros decimais inúteis.
export function formatarParaEdicao(valor) {
  if (!Number.isFinite(valor)) return "0";
  const fixo = valor.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return fixo.replace(".", ",");
}
