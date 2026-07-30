import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";
import Modal from "./Modal.jsx";

export default function ModalConfirmacao({
  nome,
  titulo = "Confirmar exclusão",
  mensagem,
  descricao,
  rotuloConfirmar = "Excluir",
  onConfirmar,
  onFechar,
}) {
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="460px">
      <div className="confirmacao">
        <span className="confirmacao__icone">
          <Icone nome="trash" tamanho={23} />
        </span>
        <p>{mensagem ?? <>Deseja realmente excluir <strong>{nome}</strong>? {descricao}</>}</p>
      </div>
      <div className="modal__rodape">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao variante="perigo" onClick={onConfirmar}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </Modal>
  );
}
