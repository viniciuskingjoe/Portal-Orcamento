import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
  exigirAdmin,
  exigirSessao,
  limparCookie,
  trocarSenha,
} from "./identidade.js";
import {
  carregarEstado,
  definirContas,
  definirSinal,
  definirUsaCentro,
  definirUsoDoCentro,
  bancoVazio,
  excluirPlano,
  excluirVisao,
  importar,
  gravarPlanejado,
  salvarConfiguracao,
  salvarPlano,
  salvarVisao,
} from "./repositorio.js";
import {
  alterarUsuario,
  concederAcesso,
  concederAcessos,
  darAcesso,
  listarUsuarios,
  limparSenha,
  removerAcesso,
  revogarAcesso,
} from "./usuarios.js";
import { buscarUsuarios } from "./ldap.js";
import { podeEditar } from "../src/dados/permissoes.js";

// Quem não pode editar nada não passa nas rotas de escrita. A checagem fina,
// célula a célula, é feita dentro da rota do planejado.
function exigirEdicao(req, _res, next) {
  if (req.sessao?.admin || req.sessao?.acessos?.some((a) => a.podeEditar)) return next();
  const erro = new Error("Você não tem permissão para alterar o orçamento.");
  erro.status = 403;
  next(erro);
}

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

// Em produção quem fala com o Express é o `cloudflared`, no mesmo host, e o IP
// real do visitante vem no `X-Forwarded-For`. Sem isto toda requisição chega
// como 127.0.0.1 e o limite por origem passa a ver a empresa inteira como uma
// origem só.
//
// `loopback` e não `1`: assim o cabeçalho só é aceito quando quem conecta é o
// próprio host. Confiando em qualquer peer, bastaria alcançar a porta na rede e
// mandar um `X-Forwarded-For` inventado para escapar do limite a cada tentativa.
app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback");
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

// Fora de `exigirSessao` de propósito: com troca pendente aquele middleware
// recusa tudo com 428, e esta é justamente a rota que resolve a pendência.
app.post(
  "/api/senha",
  rota(async (req, res) => {
    if (!req.sessao) {
      const erro = new Error("Sessão expirada. Entre novamente.");
      erro.status = 401;
      throw erro;
    }
    await trocarSenha({
      login: req.sessao.login,
      senhaAtual: req.body?.senhaAtual,
      senhaNova: req.body?.senhaNova,
      ip: req.ip,
      sessaoAtual: cookieDaRequisicao(req),
    });
    res.json({ ok: true });
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

// --------------------------------------------------------------------------
// Dados do portal
//
// Escritas granulares, uma por operação de domínio. Gravar o estado inteiro a
// cada tecla mandaria dezenas de milhares de linhas por clique.
//
// `exigirEdicao` fecha o que altera dado: a permissão deixa de ser só sobre o
// que aparece na tela e passa a valer no gravar.
// --------------------------------------------------------------------------

app.get(
  "/api/estado",
  rota(async (_req, res) => res.json(await carregarEstado()))
);

// Diz se o portal ainda não tem nada — é o que decide se vale oferecer a
// importação do que ficou no navegador.
app.get(
  "/api/estado/vazio",
  rota(async (_req, res) => res.json({ vazio: await bancoVazio() }))
);

app.post(
  "/api/estado/importar",
  exigirAdmin,
  rota(async (req, res) => res.json(await importar(req.body, req.sessao.login)))
);

app.put(
  "/api/configuracao/:chave",
  exigirAdmin,
  rota(async (req, res) => {
    await salvarConfiguracao(req.params.chave, req.body?.valor, req.sessao.login);
    res.json({ ok: true });
  })
);

app.put(
  "/api/visoes/:id",
  exigirAdmin,
  rota(async (req, res) => {
    await salvarVisao({ id: req.params.id, ...req.body }, req.sessao.login);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/visoes/:id",
  exigirAdmin,
  rota(async (req, res) => {
    await excluirVisao(req.params.id);
    res.json({ ok: true });
  })
);

app.put(
  "/api/visoes/:id/modulos/:modulo",
  exigirAdmin,
  rota(async (req, res) => {
    const { usaCentro, filial, centro, contas, lotes, usoDoCentro, sinal } = req.body ?? {};

    if (usaCentro !== undefined) {
      await definirUsaCentro(req.params.id, req.params.modulo, usaCentro);
    }
    // Lote existe para o mapeamento padrão, que aplica as mesmas contas em todas
    // as filiais de uma vez — sem ele seriam 25 requisições por módulo.
    for (const lote of lotes ?? []) {
      await definirContas(req.params.id, req.params.modulo, lote.filial, lote.centro, lote.contas);
    }
    if (usoDoCentro !== undefined) {
      await definirUsoDoCentro(req.params.id, req.params.modulo, filial, centro, usoDoCentro);
    }
    if (contas !== undefined) {
      await definirContas(req.params.id, req.params.modulo, filial, centro, contas);
    }
    if (sinal !== undefined) {
      await definirSinal(req.params.id, req.params.modulo, sinal.conta, sinal.tipo);
    }
    res.json({ ok: true });
  })
);

app.put(
  "/api/planos/:id",
  exigirEdicao,
  rota(async (req, res) => {
    await salvarPlano({ id: req.params.id, ...req.body }, req.sessao.login);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/planos/:id",
  exigirAdmin,
  rota(async (req, res) => {
    await excluirPlano(req.params.id);
    res.json({ ok: true });
  })
);

// O ponto em que a permissão vira dinheiro: cada célula é conferida contra o
// escopo de quem está gravando, e não contra o que a tela deixou clicar.
app.put(
  "/api/planos/:id/planejado",
  exigirEdicao,
  rota(async (req, res) => {
    const celulas = Array.isArray(req.body?.celulas) ? req.body.celulas : [];

    const negada = celulas.find(
      (celula) =>
        !podeEditar(req.sessao, {
          modulo: celula.modulo,
          filial: celula.filial,
          centro: celula.centro ?? "",
        })
    );
    if (negada) {
      const erro = new Error("Você não pode lançar nesta combinação de filial e centro de custo.");
      erro.status = 403;
      throw erro;
    }

    await gravarPlanejado(req.params.id, celulas, req.sessao.login);
    res.json({ ok: true, gravadas: celulas.length });
  })
);

// --------------------------------------------------------------------------
// Administração de usuários
//
// Tudo aqui é de admin. Nenhuma rota cria senha: quem autentica é o AD.
// --------------------------------------------------------------------------

app.get(
  "/api/usuarios",
  exigirAdmin,
  rota(async (_req, res) => res.json(await listarUsuarios()))
);

// Busca no diretório para achar quem cadastrar. Usa a conta de serviço, nunca a
// de quem está logado.
app.get(
  "/api/ad/usuarios",
  exigirAdmin,
  rota(async (req, res) => res.json(await buscarUsuarios(req.query.termo)))
);

app.post(
  "/api/usuarios",
  exigirAdmin,
  rota(async (req, res) => {
    const { login } = await darAcesso(req.body ?? {}, req.sessao.login);
    res.json({ ok: true, login });
  })
);

app.post(
  "/api/usuarios/:login/senha",
  exigirSessao,
  exigirAdmin,
  rota(async (req, res) => {
    // Apaga a senha do portal: a pessoa volta a entrar pela do Windows e define
    // outra. Nenhuma senha nova é inventada nem precisa ser repassada.
    await limparSenha(req.params.login, req.sessao.login);
    res.json({ ok: true });
  })
);

app.put(
  "/api/usuarios/:login",
  exigirAdmin,
  rota(async (req, res) => {
    await alterarUsuario(req.params.login, req.body ?? {}, req.sessao.login);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/usuarios/:login",
  exigirAdmin,
  rota(async (req, res) => {
    // Tirar o próprio acesso deixaria o portal sem quem administre.
    if (req.params.login === req.sessao.login) {
      const erro = new Error("Você não pode remover o seu próprio acesso.");
      erro.status = 400;
      throw erro;
    }
    await removerAcesso(req.params.login, req.sessao.login);
    res.json({ ok: true });
  })
);

app.post(
  "/api/usuarios/:login/acessos",
  exigirAdmin,
  rota(async (req, res) => {
    // Aceita uma concessão ou um lote. O lote existe porque a tela deixa marcar
    // vários centros de uma vez, e meia concessão gravada é pior que nenhuma.
    const lista = Array.isArray(req.body?.acessos) ? req.body.acessos : [req.body ?? {}];
    await concederAcessos(req.params.login, lista, req.sessao.login);
    res.json({ ok: true, concedidas: lista.length });
  })
);

app.delete(
  "/api/usuarios/:login/acessos/:id",
  exigirAdmin,
  rota(async (req, res) => {
    await revogarAcesso(req.params.login, req.params.id);
    res.json({ ok: true });
  })
);

// --------------------------------------------------------------------------
// O front, em produção
//
// Em desenvolvimento quem entrega o React é o Vite, que ainda faz proxy de
// /api para cá. Na VM não existe Vite: se ninguém servir o `dist/`, a porta
// responde /api/* e devolve 404 para o navegador — tela branca.
//
// Só liga quando o build existe, então rodar `npm run api` sozinho em
// desenvolvimento continua se comportando como API pura.
// --------------------------------------------------------------------------

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const temBuild = existsSync(join(dist, "index.html"));

if (temBuild) {
  // `index: false` para o fallback abaixo ser o único a servir o index.html —
  // com uma regra só, o cache dele fica num lugar só.
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
}

// 404 de API é JSON: quem chama espera JSON e engolir isso num HTML de SPA
// transformaria erro de rota em "resposta inesperada: não era JSON".
app.use("/api", (_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

if (temBuild) {
  // Fallback de SPA: as rotas do portal existem só no navegador, então recarregar
  // a página numa delas precisa devolver o index.html. Sem `maxAge`: o HTML
  // aponta para os assets com hash e não pode ficar velho em cache.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(join(dist, "index.html"));
  });
}

app.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

// Detalhe do erro fica no log do servidor; o cliente recebe só a mensagem.
// Sem isto, stack trace e nome de objeto do banco vazariam na resposta.
app.use((erro, _req, res, _next) => {
  const status = erro.status ?? 500;
  if (status >= 500) console.error("[api]", erro);
  if (erro.retryApos) res.set("Retry-After", String(erro.retryApos));
  res.status(status).json({ erro: erro.message ?? "Erro interno." });
});

// `??` não serve aqui: uma chave presente e vazia no .env (`API_PORT=`) chega
// como "", que não é nullish. `Number("")` é 0, e porta 0 no Node significa
// "sorteie uma porta livre" — o processo sobe, o systemd diz `active`, e não há
// nada na porta esperada. Falha silenciosa, cara de achar.
const doAmbiente = (chave, padrao) => {
  const valor = process.env[chave]?.trim();
  return valor ? valor : padrao;
};

const porta = Number(doAmbiente("API_PORT", "3000"));
if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
  console.error(`[api] API_PORT inválida: ${JSON.stringify(process.env.API_PORT)}`);
  process.exit(1);
}

// Escuta só em loopback por padrão. Na VM quem conecta é o `cloudflared`, no
// mesmo host, então nada precisa alcançar esta porta pela rede — e o que não é
// alcançável não tem como ter o `X-Forwarded-For` forjado. Para expor na rede
// (sem túnel), `API_HOST=0.0.0.0`.
const host = doAmbiente("API_HOST", "127.0.0.1");

const servidor = app.listen(porta, host, () => {
  console.log(`[api] ouvindo em http://${host}:${porta}${temBuild ? " (servindo dist/)" : ""}`);
});

// Porta ocupada é o erro mais provável aqui (cada portal tem a sua). Sem isto o
// processo morre com stack trace de EADDRINUSE, que não diz o que fazer.
servidor.on("error", (erro) => {
  if (erro.code === "EADDRINUSE") {
    console.error(`[api] a porta ${porta} já está em uso. Cada portal precisa da sua.`);
  } else {
    console.error("[api] não foi possível escutar:", erro.message);
  }
  process.exit(1);
});

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    servidor.close(async () => {
      await encerrar();
      process.exit(0);
    });
  });
}
