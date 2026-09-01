const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizarOrigem(valor) {
  try {
    const url = new URL(String(valor ?? "").trim());
    if (!url.protocol.startsWith("http")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function origensDaEnv(valor = process.env.APP_ORIGINS) {
  return new Set(
    String(valor ?? "")
      .split(",")
      .map(normalizarOrigem)
      .filter(Boolean)
  );
}

export function validarOrigemMutavel({
  method,
  origin,
  secFetchSite,
  contentType,
  origemDaRequisicao,
  origensExtras = new Set(),
}) {
  if (METODOS_SEGUROS.has(String(method ?? "GET").toUpperCase())) return null;

  // `Sec-Fetch-Site` é calculado pelo próprio navegador comparando a origem da
  // PÁGINA com a URL pedida, antes de qualquer proxy — não pode ser forjado
  // por JavaScript. "same-origin" já prova que a chamada nasceu aqui mesmo,
  // mesmo quando um proxy no meio (Vite em dev, Cloudflare Tunnel em
  // produção) reescreve o Host que o Express enxerga e o Origin comparado
  // contra esse Host deixaria de bater — foi exatamente esse descompasso que
  // bloqueava o login inteiro em `npm run dev` antes deste ajuste.
  if (secFetchSite !== "same-origin") {
    const origemRecebida = normalizarOrigem(origin);
    const permitidas = new Set(origensExtras);
    const origemAtual = normalizarOrigem(origemDaRequisicao);
    if (origemAtual) permitidas.add(origemAtual);

    if (origin && (!origemRecebida || !permitidas.has(origemRecebida))) {
      return "Origem da requisição não autorizada.";
    }

    // Browsers modernos enviam Origin em quase todo POST/PUT/DELETE; a falta
    // dele só é normal em scripts sem navegador. Chegando aqui, Sec-Fetch-Site
    // já não é "same-origin" — só bloqueia se o navegador afirma outra coisa.
    if (!origin && secFetchSite && secFetchSite !== "none") {
      return "Origem da requisição não autorizada.";
    }
  }

  // Formulário HTML simples é o principal vetor para POST sem JSON. Scripts de
  // manutenção sem corpo continuam aceitos; se houver Content-Type, tem que ser
  // o mesmo JSON que a API documenta.
  if (contentType && !String(contentType).toLowerCase().startsWith("application/json")) {
    return "Envie alterações como application/json.";
  }

  return null;
}

export function protegerOrigem(req, _res, next) {
  const host = req.get("host");
  const origemDaRequisicao = host ? `${req.protocol}://${host}` : null;
  const erroDeValidacao = validarOrigemMutavel({
    method: req.method,
    origin: req.get("origin"),
    secFetchSite: req.get("sec-fetch-site"),
    contentType: req.get("content-type"),
    origemDaRequisicao,
    origensExtras: origensDaEnv(),
  });
  if (!erroDeValidacao) return next();

  const erro = new Error(erroDeValidacao);
  erro.status = 403;
  next(erro);
}
