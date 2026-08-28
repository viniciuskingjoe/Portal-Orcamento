import { useState } from "react";

import Botao from "../componentes/Botao.jsx";
import CampoSenha from "../componentes/CampoSenha.jsx";
import Icone from "../componentes/Icone.jsx";
import Modal from "../componentes/Modal.jsx";
import { EMPRESA } from "../dados/seeds.js";

// ============================================================================
// TROCA DE SENHA
//
// Aparece quando `sessao.trocarSenha` está marcado — no caso normal, porque a
// pessoa acabou de entrar pela senha da rede e ainda não tem senha do portal.
// Não é sugestão: o servidor recusa todo o resto com 428 até a troca acontecer.
//
// A pessoa também chega aqui por vontade própria, pelo menu, e aí `obrigatoria`
// vem falso e existe o botão de cancelar.
//
// A crítica de força é do SERVIDOR (server/senha.js). Aqui só se confere o que
// é imediato — os dois campos baterem — para não fazer a pessoa esperar uma
// requisição só para descobrir que digitou diferente.
// ============================================================================

export default function TelaTrocarSenha({ sessao, obrigatoria = false, onTrocar, onCancelar }) {
  // No primeiro acesso a pessoa ainda não tem senha no portal: quem confirma é
  // a senha do Windows, a mesma com que ela acabou de entrar.
  const primeiroAcesso = sessao?.primeiroAcesso === true;
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const diferem = repetida.length > 0 && senhaNova !== repetida;

  // Lê do formulário, não do estado: o gerenciador de senhas preenche o DOM sem
  // avisar o React, e a senha atual chegaria vazia ao servidor. Ver TelaLogin.
  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const campos = new FormData(evento.currentTarget);
    const atual = String(campos.get("senhaAtual") ?? "");
    const nova = String(campos.get("senhaNova") ?? "");
    const confirmada = String(campos.get("repetida") ?? "");

    if (!atual || !nova) return setErro("Preencha os dois campos de senha.");
    if (nova !== confirmada) return setErro("As duas senhas novas não são iguais.");

    setEnviando(true);
    setErro("");
    try {
      await onTrocar({ senhaAtual: atual, senhaNova: nova });
    } catch (falha) {
      // A mensagem vem pronta do servidor: é ele que conhece a regra.
      setErro(falha?.message ?? "Não foi possível trocar a senha.");
      setEnviando(false);
    }
  }

  const campos = (
    <>
      <CampoSenha
        nome="senhaAtual"
        rotulo={primeiroAcesso ? "Senha da rede (Windows)" : "Senha atual"}
        valor={senhaAtual}
        aoMudar={setSenhaAtual}
        disabled={enviando}
        autoFocus
      />

      <CampoSenha
        nome="senhaNova"
        rotulo="Senha nova"
        valor={senhaNova}
        aoMudar={setSenhaNova}
        autoComplete="new-password"
        disabled={enviando}
        dica="Pelo menos 6 caracteres. Não pode conter o seu nome nem o seu login."
      />

      <CampoSenha
        nome="repetida"
        rotulo="Repita a senha nova"
        valor={repetida}
        aoMudar={setRepetida}
        autoComplete="new-password"
        disabled={enviando}
        invalido={diferem}
        dica={diferem ? "As duas não são iguais." : null}
      />

      {erro ? (
        <p className="login-erro" role="alert">
          <Icone nome="info" tamanho={16} />
          <span>{erro}</span>
        </p>
      ) : null}
    </>
  );

  // Voluntária (pelo menu, com o app já aberto atrás) vira modal — a pessoa
  // não saiu de lugar nenhum, só abriu uma caixa por cima. A tela cheia de
  // login fica só pra obrigatória: aí ainda não tem app nenhum atrás pra
  // mostrar, e a sidebar some porque a sessão nem está liberada ainda.
  if (!obrigatoria) {
    return (
      <Modal titulo="Trocar senha" onFechar={onCancelar} largura="440px">
        <form onSubmit={enviar}>
          <div className="modal__conteudo">
            <p className="campo__ajuda">Você está logado como {sessao?.nome ?? sessao?.login}.</p>
            {campos}
          </div>
          <div className="modal__rodape">
            <Botao variante="secundario" onClick={onCancelar} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar senha"}
            </Botao>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <main className="tela-login">
      <div className="login-marca">
        <strong>AKR</strong>
        <span className="login-marca__divisor" />
        <span>BRANDS</span>
      </div>

      <form className="cartao-login" onSubmit={enviar}>
        <div className="cartao-login__titulo">
          <h1>Defina a senha do portal</h1>
          <p>
            {primeiroAcesso
              ? "Você entrou com a senha da rede. Escolha agora uma senha só deste portal — é ela que vai valer daqui em diante."
              : "Escolha uma senha nova para continuar."}
          </p>
        </div>

        {campos}

        {/* Sem "cancelar": não há para onde ir — o servidor recusa o resto do
            portal até a troca acontecer. Um botão que não leva a lugar
            nenhum só faz a pessoa tentar e achar que travou. */}
        <button type="submit" className="botao botao--primario botao--login" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar senha"}
        </button>
      </form>

      <p className="login-rodape">{EMPRESA}</p>
    </main>
  );
}
