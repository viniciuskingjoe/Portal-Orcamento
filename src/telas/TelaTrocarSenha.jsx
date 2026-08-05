import { useState } from "react";

import CampoSenha from "../componentes/CampoSenha.jsx";
import Icone from "../componentes/Icone.jsx";
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
  const pronto = senhaAtual && senhaNova.length >= 10 && senhaNova === repetida && !enviando;

  async function enviar(evento) {
    evento.preventDefault();
    if (!pronto) return;

    setEnviando(true);
    setErro("");
    try {
      await onTrocar({ senhaAtual, senhaNova });
    } catch (falha) {
      // A mensagem vem pronta do servidor: é ele que conhece a regra.
      setErro(falha?.message ?? "Não foi possível trocar a senha.");
      setEnviando(false);
    }
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
          <h1>{obrigatoria ? "Defina a senha do portal" : "Trocar senha"}</h1>
          <p>
            {primeiroAcesso
              ? "Você entrou com a senha da rede. Escolha agora uma senha só deste portal — é ela que vai valer daqui em diante."
              : obrigatoria
                ? "Escolha uma senha nova para continuar."
                : `Você está logado como ${sessao?.nome ?? sessao?.login}.`}
          </p>
        </div>

        <CampoSenha
          rotulo={primeiroAcesso ? "Senha da rede (Windows)" : "Senha atual"}
          valor={senhaAtual}
          aoMudar={setSenhaAtual}
          disabled={enviando}
          autoFocus
        />

        <CampoSenha
          rotulo="Senha nova"
          valor={senhaNova}
          aoMudar={setSenhaNova}
          autoComplete="new-password"
          disabled={enviando}
          dica="Pelo menos 10 caracteres. Não pode conter o seu nome nem o seu login."
        />

        <CampoSenha
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

        <button type="submit" className="botao botao--primario botao--login" disabled={!pronto}>
          {enviando ? "Salvando…" : "Salvar senha"}
        </button>

        {/* Sem "cancelar" quando é obrigatória: não há para onde ir — o servidor
            recusa o resto do portal até a troca acontecer. Um botão que não
            leva a lugar nenhum só faz a pessoa tentar e achar que travou. */}
        {!obrigatoria && onCancelar ? (
          <button type="button" className="botao botao--login" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        ) : null}

      </form>

      <p className="login-rodape">{EMPRESA}</p>
    </main>
  );
}
