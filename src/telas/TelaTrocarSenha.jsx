import { useState } from "react";

import Icone from "../componentes/Icone.jsx";
import { EMPRESA } from "../dados/seeds.js";

// ============================================================================
// TROCA DE SENHA
//
// Aparece quando `sessao.trocarSenha` está marcado: a pessoa entrou com a senha
// que o administrador entregou, e essa senha passou por e-mail, WhatsApp ou pelo
// corredor. Trocar não é sugestão — o servidor recusa todo o resto com 428
// enquanto a troca não acontece.
//
// A pessoa também chega aqui por vontade própria, pelo menu, e aí `obrigatoria`
// vem falso e existe o botão de cancelar.
//
// A crítica de força é do SERVIDOR (server/senha.js). Aqui só se confere o que
// é imediato — os dois campos baterem — para não fazer a pessoa esperar uma
// requisição só para descobrir que digitou diferente.
// ============================================================================

export default function TelaTrocarSenha({ sessao, obrigatoria = false, onTrocar, onCancelar }) {
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
      <form className="cartao-login" onSubmit={enviar}>
        <div className="cartao-login__marca">
          <strong>AKR</strong>
          <span>BRANDS</span>
        </div>

        <div className="cartao-login__titulo">
          <h1>{obrigatoria ? "Defina a sua senha" : "Trocar senha"}</h1>
          <p>
            {obrigatoria
              ? "A senha que você recebeu é temporária e passou por outra pessoa. Escolha uma que só você saiba."
              : `Você está logado como ${sessao?.nome ?? sessao?.login}.`}
          </p>
        </div>

        <label className="campo-login">
          <span>{obrigatoria ? "Senha que você recebeu" : "Senha atual"}</span>
          <input
            type="password"
            value={senhaAtual}
            onChange={(evento) => setSenhaAtual(evento.target.value)}
            autoComplete="current-password"
            autoFocus
            disabled={enviando}
          />
        </label>

        <label className="campo-login">
          <span>Senha nova</span>
          <input
            type="password"
            value={senhaNova}
            onChange={(evento) => setSenhaNova(evento.target.value)}
            autoComplete="new-password"
            disabled={enviando}
          />
          <small className="campo-login__dica">
            Pelo menos 10 caracteres. Não pode conter o seu nome nem o seu login.
          </small>
        </label>

        <label className="campo-login">
          <span>Repita a senha nova</span>
          <input
            type="password"
            value={repetida}
            onChange={(evento) => setRepetida(evento.target.value)}
            autoComplete="new-password"
            disabled={enviando}
            aria-invalid={diferem || undefined}
          />
          {diferem ? <small className="campo-login__dica campo-login__dica--erro">As duas não são iguais.</small> : null}
        </label>

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

        <p className="cartao-login__rodape">{EMPRESA}</p>
      </form>
    </main>
  );
}
