import { useState } from "react";

import CampoSenha from "../componentes/CampoSenha.jsx";
import Icone from "../componentes/Icone.jsx";
import PainelInstrumentos from "../componentes/PainelInstrumentos.jsx";
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
  const [aviso, setAviso] = useState("");

  // O que vale é o FORMULÁRIO, não o estado do React.
  //
  // O preenchimento automático do navegador escreve direto no DOM e nem sempre
  // dispara o `change` que o React escuta: os campos aparecem cheios e
  // `usuario`/`senha` continuam vazios. Enquanto o botão dependia do estado, ele
  // ficava apagado com a senha à vista — e submeter mandaria string vazia.
  //
  // Ler do formulário resolve os dois: o valor é o que está na tela, tenha vindo
  // de digitação ou do gerenciador de senhas.
  function enviar(evento) {
    evento.preventDefault();
    if (carregando) return;

    const campos = new FormData(evento.currentTarget);
    const login = String(campos.get("usuario") ?? "").trim();
    const segredo = String(campos.get("senha") ?? "");

    if (!login || !segredo) {
      setAviso("Preencha o usuário e a senha.");
      return;
    }

    setAviso("");
    onEntrar({ usuario: login, senha: segredo });
  }

  return (
    <main className="tela-login">
      <PainelInstrumentos />

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
            name="usuario"
            value={usuario}
            onChange={(evento) => setUsuario(evento.target.value)}
            autoComplete="username"
            autoFocus
            spellCheck={false}
            placeholder="nome.sobrenome"
            disabled={carregando}
          />
        </label>

        <CampoSenha
          nome="senha"
          rotulo="Senha do portal"
          valor={senha}
          aoMudar={setSenha}
          disabled={carregando}
        />

        {erro || aviso ? (
          <p className="login-erro" role="alert">
            <Icone nome="info" tamanho={16} />
            <span>{erro || aviso}</span>
          </p>
        ) : null}

        <button type="submit" className="botao botao--primario botao--login" disabled={carregando}>
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
