import Botao from "./Botao.jsx";
import Modal from "./Modal.jsx";

// Modal de campo único, usado para cadastrar/renomear filiais, centros de custo
// e visões — os três só precisam de um nome.
export default function ModalNome({
  titulo,
  rotulo = "Nome",
  ajuda,
  valor,
  onAlterar,
  onSalvar,
  onFechar,
}) {
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="520px">
      <form
        className="modal__form"
        onSubmit={(evento) => {
          evento.preventDefault();
          onSalvar();
        }}
      >
        <div className="modal__conteudo">
          <label className="campo">
            <span>{rotulo}</span>
            <input value={valor} onChange={(evento) => onAlterar(evento.target.value)} autoFocus />
          </label>
          {ajuda ? <p className="modal__nota">{ajuda}</p> : null}
        </div>
        <div className="modal__rodape">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <button type="submit" className="botao botao--primario" disabled={!valor.trim()}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
