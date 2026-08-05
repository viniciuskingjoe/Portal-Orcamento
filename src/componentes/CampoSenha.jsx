import { useId, useState } from "react";

import Icone from "./Icone.jsx";

// ============================================================================
// CAMPO DE SENHA COM O OLHO PARA REVELAR
//
// Conferir o que se digitou evita a terceira tentativa errada — e aqui a
// terceira custa caro: o login trava por cinco minutos depois de cinco erros.
//
// Nasce sempre escondida e o estado morre junto com a tela: revelar é uma
// decisão de quem está na frente do teclado naquele momento, não algo que o
// portal lembre para a próxima pessoa que sentar ali.
// ============================================================================

export default function CampoSenha({
  rotulo,
  valor,
  aoMudar,
  autoComplete = "current-password",
  disabled = false,
  autoFocus = false,
}) {
  const [visivel, setVisivel] = useState(false);
  const id = useId();

  return (
    <div className="campo-login">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-senha">
        <input
          id={id}
          type={visivel ? "text" : "password"}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          autoFocus={autoFocus}
          spellCheck={false}
        />
        {/* `tabIndex={-1}` de propósito: quem navega pelo teclado sai da senha
            direto para o botão de entrar. O olho é gesto de mouse, e ficar no
            caminho do Tab atrapalharia mais gente do que ajudaria. */}
        <button
          type="button"
          className="campo-senha__olho"
          onClick={() => setVisivel((atual) => !atual)}
          disabled={disabled}
          tabIndex={-1}
          aria-pressed={visivel}
          aria-label={visivel ? "Ocultar a senha" : "Mostrar a senha"}
          title={visivel ? "Ocultar a senha" : "Mostrar a senha"}
        >
          <Icone nome={visivel ? "eyeOff" : "eye"} tamanho={18} />
        </button>
      </div>
    </div>
  );
}
