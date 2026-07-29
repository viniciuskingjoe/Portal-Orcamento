import { useEffect, useRef } from "react";
import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";

// Também é um `<dialog>`: só a apresentação é de painel lateral. Assim ganha
// Escape para fechar e retenção de foco sem código extra.
export default function DrawerNovoPlano({ valores, erro, onAlterar, onSalvar, onFechar }) {
  const referencia = useRef(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  return (
    <dialog
      ref={referencia}
      className="drawer"
      aria-label="Adicionar plano orçamentário"
      onCancel={(evento) => {
        evento.preventDefault();
        onFechar();
      }}
    >
      <form
        method="dialog"
        className="drawer__form"
        onSubmit={(evento) => {
          evento.preventDefault();
          onSalvar();
        }}
      >
        <div className="drawer__topo">
          <div>
            <span>Novo cenário</span>
            <h2>Adicionar plano orçamentário</h2>
          </div>
          <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar">
            <Icone nome="close" />
          </button>
        </div>

        <div className="drawer__conteudo">
          <label className="campo">
            <span>
              Nome <b>*</b>
            </span>
            <input
              value={valores.nome}
              onChange={(evento) => onAlterar({ nome: evento.target.value })}
              placeholder="Ex.: Orçamento Base 2027"
              autoFocus
            />
          </label>
          <div className="campos-duplos">
            <label className="campo">
              <span>Período de</span>
              <input
                type="number"
                value={valores.inicio}
                onChange={(evento) => onAlterar({ inicio: evento.target.value })}
              />
            </label>
            <label className="campo">
              <span>Até</span>
              <input
                type="number"
                value={valores.fim}
                onChange={(evento) => onAlterar({ fim: evento.target.value })}
              />
            </label>
          </div>
          {erro ? (
            <p className="erro-campo" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="drawer__nota">
            <Icone nome="info" tamanho={18} />
            <p>Cada plano mantém seus cadastros e valores de forma independente.</p>
          </div>
        </div>

        <div className="drawer__rodape">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <button type="submit" className="botao botao--primario">
            Salvar plano
          </button>
        </div>
      </form>
    </dialog>
  );
}
