import { useCallback, useEffect, useState } from "react";

import { api, quandoSessaoExpirar } from "./api.js";

// ============================================================================
// SESSÃO
//
// O cookie é httpOnly: o JavaScript não consegue lê-lo, e é justamente essa a
// proteção — um XSS não rouba a sessão. Quem sabe se há sessão é o servidor,
// então o estado daqui nasce de uma pergunta a ele.
// ============================================================================

export function useSessao() {
  const [sessao, setSessao] = useState(null);
  // `carregando` começa true: entre abrir a página e o servidor responder, não
  // se sabe se há sessão. Começar em false piscaria a tela de login para quem
  // já está logado.
  const [carregando, setCarregando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    api
      .sessao()
      .then((atual) => vivo && setSessao(atual))
      .catch(() => vivo && setSessao(null))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const entrar = useCallback(async ({ usuario, senha }) => {
    setEntrando(true);
    setErro("");
    try {
      setSessao(await api.login(usuario, senha));
    } catch (falha) {
      // A mensagem vem pronta do servidor e é deliberadamente genérica em erro
      // de credencial. Só a de configuração (503) é específica, para o suporte
      // não procurar senha errada onde o problema é o certificado do DC.
      setErro(falha?.message ?? "Não foi possível entrar.");
    } finally {
      setEntrando(false);
    }
  }, []);

  const sair = useCallback(async () => {
    await api.logout().catch(() => {});
    setSessao(null);
    setErro("");
  }, []);

  // Deixa o erro subir: quem chama é o formulário, e é ele que sabe onde
  // mostrar "a senha atual está errada" sem derrubar a tela.
  const trocarSenha = useCallback(async ({ senhaAtual, senhaNova }) => {
    await api.trocarSenha(senhaAtual, senhaNova);
    // Relê do servidor em vez de apagar `trocarSenha` na mão: a sessão é dele, e
    // adivinhar aqui é como o front e o servidor passam a discordar.
    setSessao(await api.sessao());
  }, []);

  // Disparada por qualquer 401 no meio do uso: a sessão morreu do outro lado
  // (expirou, admin revogou, alguém saiu do AD) e a tela precisa voltar ao login
  // em vez de insistir em requisições que nunca vão passar.
  // Um 401 costuma chegar em rajada: várias requisições em voo caem juntas. Não
  // precisa de trava — gravar o mesmo valor não re-renderiza.
  const expirar = useCallback(() => {
    setSessao(null);
    setErro("Sua sessão expirou. Entre novamente.");
  }, []);

  // O cliente da API não conhece React; avisa por callback. Registrar aqui, e
  // não em cada tela, é o que garante que nenhuma rota fique de fora.
  useEffect(() => {
    quandoSessaoExpirar(expirar);
    return () => quandoSessaoExpirar(null);
  }, [expirar]);

  return { sessao, carregando, entrando, erro, entrar, sair, expirar, trocarSenha };
}
