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
  // `name` no input: quem lê o formulário com FormData pega o valor mesmo
  // quando o preenchimento automático do navegador não avisa o React.
  nome,
  valor,
  aoMudar,
  autoComplete = "current-password",
  disabled = false,
  autoFocus = false,
  // Texto sob o campo: a regra de força, ou o aviso de que as duas não batem.
  dica = null,
  invalido = false,
}) {
  const [visivel, setVisivel] = useState(false);
  const id = useId();
  const idDica = `${id}-dica`;

  return (
    <div className="campo-login">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-senha">
        <input
          id={id}
          name={nome}
          type={visivel ? "text" : "password"}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          autoFocus={autoFocus}
          spellCheck={false}
          aria-invalid={invalido || undefined}
          aria-describedby={dica ? idDica : undefined}
        />
        {/* Sem tabIndex: quem digita a senha errada e quer conferir antes de
            enviar precisa alcançar isto pelo teclado — a tela de login é
            justamente a que trava 5 minutos depois de 5 erros, então não dá
            pra deixar essa conferência só pra quem usa mouse. */}
        <button
          type="button"
          className="campo-senha__olho"
          onClick={() => setVisivel((atual) => !atual)}
          disabled={disabled}
          aria-pressed={visivel}
          aria-label={visivel ? "Ocultar a senha" : "Mostrar a senha"}
          title={visivel ? "Ocultar a senha" : "Mostrar a senha"}
        >
          <Icone nome={visivel ? "eyeOff" : "eye"} tamanho={18} />
        </button>
      </div>

      {dica ? (
        <small
          id={idDica}
          className={`campo-login__dica ${invalido ? "campo-login__dica--erro" : ""}`}
        >
          {dica}
        </small>
      ) : null}
    </div>
  );
}
