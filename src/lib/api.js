// Cliente da API do portal. O Vite encaminha /api/* para o backend, então em
// dev e em produção o caminho é o mesmo — sem base URL configurável, sem CORS.

const RODAR_API =
  "A API não está respondendo. Pare o servidor e rode `npm run dev`, que sobe a API junto com o front.";

class ErroDaApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = "ErroDaApi";
    this.status = status;
  }
}

// Aviso único de sessão morta. Fica aqui, e não em cada chamada, porque 401 pode
// vir de qualquer uma das rotas abaixo: obrigar todo `catch` da aplicação a
// lembrar de tratá-lo é garantir que um deles esqueça, e aí a tela trava sem
// dizer por quê.
let aoExpirarSessao = null;

export function quandoSessaoExpirar(callback) {
  aoExpirarSessao = callback;
}

async function buscar(caminho, parametros, opcoes = {}) {
  const url = new URL(caminho, window.location.origin);
  Object.entries(parametros ?? {}).forEach(([chave, valor]) => {
    if (valor != null) url.searchParams.set(chave, String(valor));
  });

  // DELETE não leva corpo, mas precisa do método explícito.
  const corpoEnviado = opcoes.corpo;
  let resposta;
  try {
    resposta = await fetch(url, {
      method: opcoes.metodo ?? (corpoEnviado ? "POST" : "GET"),
      // O cookie de sessão é httpOnly: o JavaScript não o lê, mas precisa
      // pedir que ele vá junto.
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(corpoEnviado ? { "Content-Type": "application/json" } : {}),
      },
      body: corpoEnviado ? JSON.stringify(corpoEnviado) : undefined,
    });
  } catch (erro) {
    throw new ErroDaApi(`${RODAR_API} (${erro.message})`, 0);
  }

  // Lê como texto para poder distinguir "a API respondeu um erro" de "quem
  // respondeu não foi a API". Quando o backend está fora, o proxy do Vite
  // devolve 500 com HTML — e `Erro 500 em /api/contas` não diz o que fazer.
  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    // 401 é sessão expirada, não falha de rede: quem chama volta para o login
    // em vez de mostrar "a API não está respondendo".
    if (resposta.status === 401) {
      // Menos no próprio login: ali 401 é senha errada, e derrubar a sessão
      // apagaria a mensagem de erro que a pessoa precisa ler.
      if (!caminho.startsWith("/api/login")) aoExpirarSessao?.();
      throw new ErroDaApi(corpo?.erro ?? "Sessão expirada. Entre novamente.", 401);
    }
    if (corpo?.erro) throw new ErroDaApi(corpo.erro, resposta.status);
    // Sem JSON no corpo, o erro não veio do nosso handler: é o proxy sem alcançar
    // o backend, ou um intermediário no caminho.
    throw new ErroDaApi(`${RODAR_API} (HTTP ${resposta.status} em ${caminho})`, resposta.status);
  }

  if (corpo == null) {
    throw new ErroDaApi(`Resposta inesperada em ${caminho}: não era JSON.`, resposta.status);
  }
  return corpo;
}

export const api = {
  health: () => buscar("/api/health"),
  sessao: () => buscar("/api/sessao"),
  login: (usuario, senha) => buscar("/api/login", null, { corpo: { usuario, senha } }),
  logout: () => buscar("/api/logout", null, { corpo: {} }),
  trocarSenha: (senhaAtual, senhaNova) =>
    buscar("/api/senha", null, { corpo: { senhaAtual, senhaNova } }),
  visoesContabeis: () => buscar("/api/visoes-contabeis"),
  contas: (visao) => buscar("/api/contas", { visao }),
  filiais: () => buscar("/api/filiais"),
  centrosDeCusto: () => buscar("/api/centros-de-custo"),
  realizado: (ano, visao, filialId) => buscar("/api/realizado", { ano, visao, filial: filialId }),

  // --- estado do portal ----------------------------------------------------
  estado: () => buscar("/api/estado"),
  estadoVazio: () => buscar("/api/estado/vazio"),
  importarEstado: (dados) => buscar("/api/estado/importar", null, { corpo: dados }),
  salvarConfiguracao: (chave, valor) =>
    buscar(`/api/configuracao/${encodeURIComponent(chave)}`, null, { metodo: "PUT", corpo: { valor } }),

  grupos: () => buscar("/api/grupos"),
  salvarGrupo: (grupo) =>
    buscar(`/api/grupos/${encodeURIComponent(grupo.id)}`, null, { metodo: "PUT", corpo: grupo }),
  excluirGrupo: (id) => buscar(`/api/grupos/${encodeURIComponent(id)}`, null, { metodo: "DELETE" }),

  salvarVisao: (visao) =>
    buscar(`/api/visoes/${encodeURIComponent(visao.id)}`, null, { metodo: "PUT", corpo: visao }),
  excluirVisao: (id) => buscar(`/api/visoes/${encodeURIComponent(id)}`, null, { metodo: "DELETE" }),
  salvarModulo: (visaoId, modulo, mudanca) =>
    buscar(`/api/visoes/${encodeURIComponent(visaoId)}/modulos/${encodeURIComponent(modulo)}`, null, {
      metodo: "PUT",
      corpo: mudanca,
    }),

  salvarPlano: (plano) =>
    buscar(`/api/planos/${encodeURIComponent(plano.id)}`, null, { metodo: "PUT", corpo: plano }),
  excluirPlano: (id) => buscar(`/api/planos/${encodeURIComponent(id)}`, null, { metodo: "DELETE" }),
  duplicarPlano: (id, novo) =>
    buscar(`/api/planos/${encodeURIComponent(id)}/duplicar`, null, { corpo: novo }),
  situacaoDoPlano: (id, situacao) =>
    buscar(`/api/planos/${encodeURIComponent(id)}/situacao`, null, {
      metodo: "PUT",
      corpo: { situacao },
    }),
  publicarPlano: (id) =>
    buscar(`/api/planos/${encodeURIComponent(id)}/publicar`, null, { corpo: {} }),
  // --- usuários (admin) ----------------------------------------------------
  usuarios: () => buscar("/api/usuarios"),
  buscarNoAd: (termo) => buscar("/api/ad/usuarios", { termo }),
  darAcesso: (usuario) => buscar("/api/usuarios", null, { corpo: usuario }),
  alterarUsuario: (login, mudanca) =>
    buscar(`/api/usuarios/${encodeURIComponent(login)}`, null, { metodo: "PUT", corpo: mudanca }),
  redefinirSenha: (login) =>
    buscar(`/api/usuarios/${encodeURIComponent(login)}/senha`, null, { corpo: {} }),
  removerUsuario: (login) =>
    buscar(`/api/usuarios/${encodeURIComponent(login)}`, null, { metodo: "DELETE" }),
  concederAcessos: (login, acessos) =>
    buscar(`/api/usuarios/${encodeURIComponent(login)}/acessos`, null, { corpo: { acessos } }),
  revogarAcesso: (login, id) =>
    buscar(`/api/usuarios/${encodeURIComponent(login)}/acessos/${id}`, null, { metodo: "DELETE" }),

  salvarPlanejado: (planoId, celulas) =>
    buscar(`/api/planos/${encodeURIComponent(planoId)}/planejado`, null, {
      metodo: "PUT",
      corpo: { celulas },
    }),
};

export { ErroDaApi };
