import { useState } from "react";

import Icone from "../componentes/Icone.jsx";
import { EMPRESA } from "../dados/seeds.js";

// ============================================================================
// LOGIN
//
// A senha é do portal, não a da rede: o administrador entrega a primeira e a
// pessoa troca no primeiro acesso. Não há "criar conta" nem "esqueci a senha" —
// quem perde a dela pede outra a um administrador, e é ele quem sabe se está
// falando com a pessoa certa. Um formulário de recuperação faria essa decisão
// sozinho, sem saber com quem está falando.
//
// O erro é sempre o mesmo, dê o que der: dizer "usuário não existe" entrega a
// lista de quem trabalha aqui para quem estiver tentando.
// ============================================================================

export default function TelaLogin({ onEntrar, carregando, erro }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");

  const pronto = usuario.trim().length > 0 && senha.length > 0 && !carregando;

  function enviar(evento) {
    evento.preventDefault();
    if (!pronto) return;
    onEntrar({ usuario: usuario.trim(), senha });
  }

  return (
    <main className="tela-login">
      {/* A marca fica ACIMA do cartão, como nos outros portais AKR: identifica a
          casa antes de o cartão identificar qual portal é. */}
      <div className="login-marca">
        <strong>AKR</strong>
        <span className="login-marca__divisor" />
        <span>BRANDS</span>
      </div>

      <form className="cartao-login" onSubmit={enviar}>
        {/* Ícone + nome do portal, separados por uma linha do formulário. É o
            mesmo bloco do Fluxo Fiscal: quem usa os dois reconhece onde está
            sem ler. */}
        <div className="cartao-login__portal">
          <span className="cartao-login__icone">
            <Icone nome="chart" tamanho={22} />
          </span>
          <div>
            <strong>Planejamento Orçamentário</strong>
            <small>Orçamento por filial e centro de custo</small>
          </div>
        </div>

        <div className="cartao-login__titulo">
          <h1>Entrar</h1>
          <p>Use seu usuário do domínio e sua senha do portal.</p>
        </div>

        <label className="campo-login">
          <span>Usuário</span>
          <input
            value={usuario}
            onChange={(evento) => setUsuario(evento.target.value)}
            autoComplete="username"
            autoFocus
            spellCheck={false}
            placeholder="nome.sobrenome"
            disabled={carregando}
          />
        </label>

        <label className="campo-login">
          <span>Senha do portal</span>
          <input
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            autoComplete="current-password"
            disabled={carregando}
          />
        </label>

        {erro ? (
          <p className="login-erro" role="alert">
            <Icone nome="info" tamanho={16} />
            <span>{erro}</span>
          </p>
        ) : null}

        <button type="submit" className="botao botao--primario botao--login" disabled={!pronto}>
          {carregando ? "Entrando…" : "Entrar"}
        </button>

      </form>

      {/* Fora do cartão, como no Fluxo Fiscal. Só a empresa: o resto daquele
          rodapé fala de como o login funciona, e isso não é o que quem entra
          precisa ler todo dia. */}
      <p className="login-rodape">{EMPRESA}</p>
    </main>
  );
}
