import { useEffect, useRef } from "react";
import Icone from "./Icone.jsx";

// `<dialog>` nativo: Escape fecha, o foco fica preso dentro e volta para o
// gatilho ao sair — comportamento que a versão anterior (div + overlay) não
// tinha. O layout é flex-column com o corpo rolando, para o conteúdo poder
// crescer sem cortar o rodapé.
export default function Modal({ titulo, children, onFechar, largura = "620px" }) {
  const referencia = useRef(null);
  const alvoDoMouseDown = useRef(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  return (
    <dialog
      ref={referencia}
      className="modal"
      style={{ "--modal-largura": largura }}
      aria-label={titulo}
      onCancel={(evento) => {
        evento.preventDefault();
        onFechar();
      }}
      onMouseDown={(evento) => {
        alvoDoMouseDown.current = evento.target;
      }}
      onClick={(evento) => {
        // Fecha só quando o clique nasce e termina no backdrop; assim arrastar
        // uma seleção de texto para fora não fecha o modal.
        if (evento.target === referencia.current && alvoDoMouseDown.current === referencia.current) {
          onFechar();
        }
      }}
    >
      <div className="modal__topo">
        <h2>{titulo}</h2>
        <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar">
          <Icone nome="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
