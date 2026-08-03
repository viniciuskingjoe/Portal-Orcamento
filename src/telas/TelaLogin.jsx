import { useState } from "react";

import Icone from "../componentes/Icone.jsx";
import { EMPRESA } from "../dados/seeds.js";

// ============================================================================
// LOGIN
//
// A credencial é a do Windows: o servidor valida por bind no AD e o portal não
// guarda senha nenhuma. Por isso não há "criar conta", "esqueci a senha" nem
// troca de senha — nada disso é nosso.
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
      <form className="cartao-login" onSubmit={enviar}>
        <div className="cartao-login__marca">
          <strong>AKR</strong>
          <span>BRANDS</span>
        </div>

        <div className="cartao-login__titulo">
          <h1>Planejamento Orçamentário</h1>
          <p>Entre com o seu usuário da rede.</p>
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
          <span>Senha</span>
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

        <p className="cartao-login__rodape">{EMPRESA} · a senha é a mesma do computador</p>
      </form>
    </main>
  );
}
