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
  bancoVazio,
  definirSituacaoDoPlano,
  duplicarPlano,
  listarVinculosDoRealizado,
  listarGrupos,
  salvarGrupo,
  excluirGrupo,
  excluirLinhaDre,
  excluirPlano,
  excluirVisao,
  importar,
  gravarFuncionarios,
  gravarPlanejado,
  reordenarLinhasDre,
  salvarConfiguracao,
  salvarLinhaDre,
  salvarModulo,
  salvarMapeamentos,
  salvarPlano,
  salvarVisao,
  visaoContabilDaVisao,
} from "./repositorio.js";
import {
  alterarUsuario,
  concederAcessos,
  definirAcessos,
  definirConfiguracaoUsuario,
  darAcesso,
  listarUsuarios,
  limparSenha,
  removerAcesso,
  revogarAcesso,
} from "./usuarios.js";
import { publicar } from "./orcamentoLinx.js";
import { buscarUsuarios } from "./ldap.js";
import {
  ehAdmin,
  podeEditar,
  podeVer,
} from "../src/dados/permissoes.js";
import { filtrarGruposPorSessao, filtrarRealizadoPorSessao } from "./escopo.js";
import { trustProxyDaEnv } from "./proxy.js";
import { protegerOrigem } from "./origem.js";
import {
  validarAcessos,
  validarAlteracaoModulo,
  validarAlteracaoUsuario,
  validarFiliaisAtivas,
  validarGrupo,
  validarLinhaDre,
  validarMapeamentos,
  validarNovoUsuario,
  validarOrdemDre,
  validarVisao,
} from "./validacao.js";

// Quem não pode editar nada não passa nas rotas de escrita. A checagem fina,
// célula a célula, é feita dentro da rota do planejado.
function exigirEdicao(req, _res, next) {
  if (req.sessao?.admin || req.sessao?.acessos?.some((a) => a.podeEditar)) return next();
  const erro = new Error("Você não tem permissão para alterar o orçamento.");
  erro.status = 403;
  next(erro);
}

function vinculosVisiveis(sessao, vinculos) {
  if (ehAdmin(sessao)) return vinculos ?? [];
  return (vinculos ?? []).filter((item) =>
    podeVer(sessao, {
      modulo: item.modulo,
      filial: item.filial,
      centro: item.centro ?? "",
    })
  );
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

app.use((_req, res, next) => {
  res.set({
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; " +
      "frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; " +
      "object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Em produção quem fala com o Express é o `cloudflared`, no mesmo host, e o IP
// real do visitante vem no `X-Forwarded-For`. Sem isto toda requisição chega
// como 127.0.0.1 e o limite por origem passa a ver a empresa inteira como uma
// origem só.
//
// `loopback` e não `1`: assim o cabeçalho só é aceito quando quem conecta é o
// próprio host. Confiando em qualquer peer, bastaria alcançar a porta na rede e
// mandar um `X-Forwarded-For` inventado para escapar do limite a cada tentativa.
app.set("trust proxy", trustProxyDaEnv(process.env.TRUST_PROXY));
app.use("/api", protegerOrigem);
app.use(express.json({ limit: "1mb" }));

// Envolve handler async para que rejeição vire resposta de erro, não crash.
const rota = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

// Só a API usa identidade. Assets com hash não precisam consultar nem renovar
// sessão no SQL Server a cada carregamento.
app.use("/api", comSessao());

app.get(
  "/api/health",
  rota(async (_req, res) => {
    await queryOne("SELECT 1 AS ok");
    res.json({ ok: true });
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
  rota(async (req, res) => {
    const visoes = await listarVisoesContabeis();
    if (ehAdmin(req.sessao)) return res.json(visoes);

    const permitidas = new Set(
      vinculosVisiveis(req.sessao, await listarVinculosDoRealizado()).map(
        (item) => item.visaoContabil
      )
    );
    res.json(visoes.filter((visao) => permitidas.has(visao.id)));
  })
);

app.get(
  "/api/contas",
  rota(async (req, res) => {
    const visao = String(req.query.visao ?? process.env.DB_VISAO_CONTABIL ?? "").trim();
    const contas = await listarContas({ visao });
    if (ehAdmin(req.sessao)) return res.json(contas);

    const vinculos = vinculosVisiveis(req.sessao, await listarVinculosDoRealizado(visao));
    const permitidas = new Set(vinculos.map((item) => item.classificacao));
    // Pais mantêm a hierarquia legível quando o catálogo é mostrado em árvore.
    for (const codigo of [...permitidas]) {
      const partes = codigo.split(".");
      while (partes.length > 1) {
        partes.pop();
        permitidas.add(partes.join("."));
      }
    }
    res.json(contas.filter((conta) => permitidas.has(conta.codigo)));
  })
);

app.get(
  "/api/filiais",
  rota(async (req, res) => {
    const [filiais, vinculos] = await Promise.all([
      listarFiliais(),
      ehAdmin(req.sessao) ? Promise.resolve([]) : listarVinculosDoRealizado(),
    ]);
    if (ehAdmin(req.sessao)) return res.json(filiais);

    const permitidas = new Set(
      vinculosVisiveis(req.sessao, vinculos).map((item) => item.filial)
    );
    res.json(filiais.filter((filial) => permitidas.has(filial.id)));
  })
);

app.get(
  "/api/centros-de-custo",
  rota(async (req, res) => {
    const [centros, vinculos] = await Promise.all([
      listarCentrosDeCusto(),
      ehAdmin(req.sessao) ? Promise.resolve([]) : listarVinculosDoRealizado(),
    ]);
    if (ehAdmin(req.sessao)) return res.json(centros);

    const permitidos = new Set(
      vinculosVisiveis(req.sessao, vinculos)
        .map((item) => item.centro)
        .filter(Boolean)
    );
    res.json(centros.filter((centro) => permitidos.has(centro.id)));
  })
);

app.get(
  "/api/realizado",
  rota(async (req, res) => {
    const ano = Number(req.query.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return res.status(400).json({ erro: "Parâmetro `ano` inválido." });
    }
    const filialId = req.query.filial ? String(req.query.filial) : null;
    const visao = String(req.query.visao ?? process.env.DB_VISAO_CONTABIL ?? "").trim();
    const [linhas, vinculos] = await Promise.all([
      listarRealizado({ ano, filialId, visao }),
      listarVinculosDoRealizado(visao),
    ]);
    if (
      filialId &&
      !vinculosVisiveis(req.sessao, vinculos).some((item) => item.filial === filialId)
    ) {
      const erro = new Error("Você não tem acesso a esta filial.");
      erro.status = 403;
      throw erro;
    }
    res.json(filtrarRealizadoPorSessao(linhas, vinculos, req.sessao));
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
  rota(async (req, res) => res.json(await carregarEstado(req.sessao)))
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
  rota(async (req, res) => {
    const visoes = Array.isArray(req.body?.visoes) ? req.body.visoes.map(validarVisao) : [];
    const [filiais, centros, visoesContabeis] = await Promise.all([
      listarFiliais(),
      listarCentrosDeCusto(),
      listarVisoesContabeis(),
    ]);
    const contasPorVisao = new Map(
      await Promise.all(
        [...new Set(visoes.map((visao) => visao.visaoContabil))].map(async (visao) => [
          visao,
          await listarContas({ visao }),
        ])
      )
    );
    res.json(
      await importar(req.body, req.sessao.login, {
        filiais,
        centros,
        visoesContabeis,
        contasPorVisao,
      })
    );
  })
);

app.put(
  "/api/configuracao/:chave",
  exigirAdmin,
  rota(async (req, res) => {
    if (req.params.chave !== "filiaisAtivas") {
      const erro = new Error("Configuração desconhecida.");
      erro.status = 404;
      throw erro;
    }
    const valor = validarFiliaisAtivas(req.body?.valor, await listarFiliais());
    await salvarConfiguracao(req.params.chave, valor, req.sessao.login);
    res.json({ ok: true });
  })
);

// Grupos de centro de custo — configuração global, como as filiais em uso.
app.get(
  "/api/grupos",
  rota(async (req, res) => {
    res.json(filtrarGruposPorSessao(await listarGrupos(), req.sessao));
  })
);

app.put(
  "/api/grupos/:id",
  exigirAdmin,
  rota(async (req, res) => {
    const grupo = validarGrupo(
      { id: req.params.id, ...req.body },
      await listarCentrosDeCusto()
    );
    await salvarGrupo(grupo, req.sessao.login);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/grupos/:id",
  exigirAdmin,
  rota(async (req, res) => {
    await excluirGrupo(req.params.id);
    res.json({ ok: true });
  })
);

app.put(
  "/api/visoes/:id",
  exigirAdmin,
  rota(async (req, res) => {
    const visao = validarVisao({ id: req.params.id, ...req.body });
    const disponiveis = await listarVisoesContabeis();
    if (!disponiveis.some((item) => String(item.id) === visao.visaoContabil)) {
      const erro = new Error("A visão contábil informada não existe no ERP.");
      erro.status = 409;
      throw erro;
    }
    await salvarVisao(visao, req.sessao.login);
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
    const visaoContabil = await visaoContabilDaVisao(req.params.id);
    const [filiais, centros, contas] = await Promise.all([
      listarFiliais(),
      listarCentrosDeCusto(),
      listarContas({ visao: visaoContabil }),
    ]);
    const mudanca = validarAlteracaoModulo(req.params.modulo, req.body ?? {}, {
      filiais,
      centros,
      contas,
    });
    await salvarModulo(req.params.id, req.params.modulo, mudanca, req.sessao.login);
    res.json({ ok: true });
  })
);

app.put(
  "/api/visoes/:id/mapeamentos",
  exigirAdmin,
  rota(async (req, res) => {
    const visaoContabil = await visaoContabilDaVisao(req.params.id);
    const [filiais, centros, contas] = await Promise.all([
      listarFiliais(),
      listarCentrosDeCusto(),
      listarContas({ visao: visaoContabil }),
    ]);
    const mapeamentos = validarMapeamentos(req.body?.mapeamentos, { filiais, centros, contas });
    await salvarMapeamentos(req.params.id, mapeamentos, req.sessao.login);
    res.json({ ok: true, gravados: mapeamentos.length });
  })
);

// Linhas do DRE — cada uma soma um recorte de contas de um módulo, ou é
// fórmula referenciando outras linhas. Mesmo admin-only de módulos/contas:
// é configuração da visão, não lançamento.
app.put(
  "/api/visoes/:id/dre/linhas/:linhaId",
  exigirAdmin,
  rota(async (req, res) => {
    const [estado, visaoContabil] = await Promise.all([
      carregarEstado({ admin: true, login: req.sessao.login, acessos: [] }),
      visaoContabilDaVisao(req.params.id),
    ]);
    const visao = estado.visoes.find((item) => item.id === req.params.id);
    if (!visao) {
      const erro = new Error("Visão não encontrada.");
      erro.status = 404;
      throw erro;
    }
    const contas = await listarContas({ visao: visaoContabil });
    const linha = validarLinhaDre(
      { id: req.params.linhaId, ...req.body },
      { contas, linhas: visao.dreLinhas ?? [] }
    );
    await salvarLinhaDre(req.params.id, linha, req.sessao.login);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/visoes/:id/dre/linhas/:linhaId",
  exigirAdmin,
  rota(async (req, res) => {
    await excluirLinhaDre(req.params.id, req.params.linhaId);
    res.json({ ok: true });
  })
);

app.put(
  "/api/visoes/:id/dre/ordem",
  exigirAdmin,
  rota(async (req, res) => {
    const ordem = validarOrdemDre(req.body?.ordem);
    await reordenarLinhasDre(req.params.id, ordem);
    res.json({ ok: true });
  })
);

app.put(
  "/api/planos/:id",
  exigirAdmin,
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

// Cópia de um plano com todo o planejado. A cópia nasce sem vínculo com o Linx:
// a primeira sincronização dela cria um orçamento novo lá.
app.post(
  "/api/planos/:id/duplicar",
  exigirAdmin,
  rota(async (req, res) => {
    const { novoId, nome, ano } = req.body ?? {};
    res.json(await duplicarPlano({ id: req.params.id, novoId, nome, ano }, req.sessao.login));
  })
);

// Desativar em vez de excluir: o planejado fica, o plano sai da lista.
app.put(
  "/api/planos/:id/situacao",
  exigirAdmin,
  rota(async (req, res) => {
    await definirSituacaoDoPlano(req.params.id, req.body?.situacao, req.sessao.login);
    res.json({ ok: true });
  })
);

// Publica o planejado no orçamento do Linx, de onde o Power BI lê.
//
// Só admin: é a única rota do portal que escreve em tabela do ERP, e o efeito
// sai do portal — passa a valer para quem consulta o BI.
app.post(
  "/api/planos/:id/publicar",
  exigirAdmin,
  rota(async (req, res) => {
    // A publicação lê e bloqueia o estado dentro da própria transação. Receber
    // valores do navegador ou ler antes do lock permitiria carimbar como atual
    // um snapshot que outra pessoa acabou de alterar.
    res.json(await publicar(req.params.id, req.sessao.login));
  })
);

// O ponto em que a permissão vira dinheiro: cada célula é conferida contra o
// escopo de quem está gravando, e não contra o que a tela deixou clicar.
app.put(
  "/api/planos/:id/planejado",
  exigirEdicao,
  rota(async (req, res) => {
    const celulas = req.body?.celulas;

    const negada = (Array.isArray(celulas) ? celulas : []).find(
      (celula) =>
        !podeEditar(req.sessao, {
          modulo: celula?.modulo,
          filial: celula?.filial,
          centro: celula?.centro ?? "",
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

// Quantidade de funcionários. Mesma checagem célula a célula do planejado: não
// tem valor, mas diz quanta gente há num centro — quem não pode lançar naquele
// centro também não descreve o quadro dele.
app.put(
  "/api/planos/:id/funcionarios",
  exigirEdicao,
  rota(async (req, res) => {
    const celulas = req.body?.celulas;

    const negada = (Array.isArray(celulas) ? celulas : []).find(
      (celula) =>
        !podeEditar(req.sessao, {
          modulo: "despesas-pessoal",
          filial: celula?.filial,
          centro: celula?.centro ?? "",
        })
    );
    if (negada) {
      const erro = new Error("Você não pode lançar nesta combinação de filial e centro de custo.");
      erro.status = 403;
      throw erro;
    }

    await gravarFuncionarios(req.params.id, celulas, req.sessao.login);
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
    const { login } = await darAcesso(validarNovoUsuario(req.body), req.sessao.login);
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
    const mudanca = validarAlteracaoUsuario(req.body);
    if (
      req.params.login === req.sessao.login &&
      (mudanca.admin === false || mudanca.situacao === "inativo")
    ) {
      const erro = new Error("Você não pode retirar o seu próprio acesso administrativo.");
      erro.status = 400;
      throw erro;
    }
    await alterarUsuario(
      req.params.login,
      mudanca,
      req.sessao.login
    );
    res.json({ ok: true });
  })
);

app.put(
  "/api/usuarios/:login/configuracao",
  exigirAdmin,
  rota(async (req, res) => {
    const corpo = req.body ?? {};
    if (!Object.hasOwn(corpo, "admin") || !Object.hasOwn(corpo, "acessos")) {
      const erro = new Error("Campos `admin` e `acessos` são obrigatórios.");
      erro.status = 400;
      throw erro;
    }

    const { admin } = validarAlteracaoUsuario({ admin: corpo.admin });
    const acessos = validarAcessos(corpo.acessos);
    if (req.params.login === req.sessao.login && admin === false) {
      const erro = new Error("Você não pode retirar o seu próprio acesso administrativo.");
      erro.status = 400;
      throw erro;
    }

    await definirConfiguracaoUsuario(
      req.params.login,
      { admin, acessos },
      req.sessao.login
    );
    res.json({ ok: true, concedidas: acessos.length });
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
    const lista = validarAcessos(
      Array.isArray(req.body?.acessos) ? req.body.acessos : [req.body]
    );
    await concederAcessos(req.params.login, lista, req.sessao.login);
    res.json({ ok: true, concedidas: lista.length });
  })
);

// PUT troca o conjunto inteiro; POST acrescenta. O editor de territorio usa
// este, porque desmarcar um modulo na matriz precisa TIRAR a permissao.
app.put(
  "/api/usuarios/:login/acessos",
  exigirAdmin,
  rota(async (req, res) => {
    if (!Object.hasOwn(req.body ?? {}, "acessos")) {
      const erro = new Error("Campo `acessos` é obrigatório; envie [] para revogar todos.");
      erro.status = 400;
      throw erro;
    }
    const lista = validarAcessos(req.body.acessos);
    await definirAcessos(req.params.login, lista, req.sessao.login);
    res.json({ ok: true, concedidas: lista.length });
  })
);

app.delete(
  "/api/usuarios/:login/acessos/:id",
  exigirAdmin,
  rota(async (req, res) => {
    await revogarAcesso(req.params.login, req.params.id, req.sessao.login);
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
  res.status(status).json({
    erro: status >= 500 ? "Erro interno. Tente novamente em instantes." : (erro.message ?? "Erro."),
  });
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
