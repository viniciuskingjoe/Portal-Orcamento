import express from "express";

import { encerrar, queryOne } from "./sqlserver.js";
import {
  listarCentrosDeCusto,
  listarContas,
  listarFiliais,
  listarRealizado,
  listarVisoesContabeis,
} from "./consultas.js";
import {
  comSessao,
  cookieDaRequisicao,
  encerrarSessao,
  entrar,
  exigirSessao,
  limparCookie,
} from "./identidade.js";

// ============================================================================
// API do Portal Orçamento
//
// Node ESM + Express, env por `node --env-file=.env` (nativo, sem dotenv).
// Sobe com:  npm run api
//
// O front (Vite) chama /api/* e o proxy do vite.config.js encaminha para cá.
// ============================================================================

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // roda atrás do Cloudflare Tunnel em produção
app.use(express.json({ limit: "1mb" }));

// Envolve handler async para que rejeição vire resposta de erro, não crash.
const rota = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

// Resolve a sessão antes de tudo. Só popula `req.sessao`; quem exige é a rota.
app.use(comSessao());

app.get(
  "/api/health",
  rota(async (_req, res) => {
    const linha = await queryOne("SELECT DB_NAME() AS banco, SYSUTCDATETIME() AS agora");
    res.json({ ok: true, banco: linha?.banco ?? null, agora: linha?.agora ?? null });
  })
);

// --------------------------------------------------------------------------
// Sessão
// --------------------------------------------------------------------------

app.post(
  "/api/login",
  rota(async (req, res) => {
    const sessao = await entrar({
      usuario: req.body?.usuario,
      senha: req.body?.senha,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      res,
    });
    res.json(sessao);
  })
);

app.post(
  "/api/logout",
  rota(async (req, res) => {
    await encerrarSessao(cookieDaRequisicao(req));
    limparCookie(res);
    res.json({ ok: true });
  })
);

// `null` em vez de 401: no primeiro carregamento a ausência de sessão é o caso
// normal, não erro. O front decide mostrar o login.
app.get(
  "/api/sessao",
  rota(async (req, res) => res.json(req.sessao ?? null))
);

// Daqui para baixo, tudo exige sessão. Os dados do ERP são da empresa e não
// ficam abertos a quem alcançar a porta.
app.use("/api", exigirSessao);

app.get(
  "/api/visoes-contabeis",
  rota(async (_req, res) => res.json(await listarVisoesContabeis()))
);

app.get(
  "/api/contas",
  rota(async (req, res) => res.json(await listarContas({ visao: req.query.visao })))
);

app.get(
  "/api/filiais",
  rota(async (_req, res) => res.json(await listarFiliais()))
);

app.get(
  "/api/centros-de-custo",
  rota(async (_req, res) => res.json(await listarCentrosDeCusto()))
);

app.get(
  "/api/realizado",
  rota(async (req, res) => {
    const ano = Number(req.query.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return res.status(400).json({ erro: "Parâmetro `ano` inválido." });
    }
    const filialId = req.query.filial ? String(req.query.filial) : null;
    res.json(await listarRealizado({ ano, filialId, visao: req.query.visao }));
  })
);

app.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

// Detalhe do erro fica no log do servidor; o cliente recebe só a mensagem.
// Sem isto, stack trace e nome de objeto do banco vazariam na resposta.
app.use((erro, _req, res, _next) => {
  const status = erro.status ?? 500;
  if (status >= 500) console.error("[api]", erro);
  res.status(status).json({ erro: erro.message ?? "Erro interno." });
});

const porta = Number(process.env.API_PORT ?? 3000);
const servidor = app.listen(porta, () => {
  console.log(`[api] ouvindo em http://localhost:${porta}`);
});

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    servidor.close(async () => {
      await encerrar();
      process.exit(0);
    });
  });
}
