import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";
import Modal from "./Modal.jsx";

// `verbo`, `icone` e `perigo` andam juntos: são o que faz o modal parecer com a
// ação. Já foram fixos em "excluir"/lixeira/vermelho, e reaproveitá-lo para
// desativar produzia "Deseja realmente excluir TESTE?" com botão vermelho numa
// ação que não apaga nada — a tela dizia uma coisa e o sistema fazia outra.
export default function ModalConfirmacao({
  nome,
  titulo = "Confirmar exclusão",
  verbo = "excluir",
  icone = "trash",
  perigo = true,
  mensagem,
  descricao,
  rotuloConfirmar = "Excluir",
  onConfirmar,
  onFechar,
}) {
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="460px">
      <div className="confirmacao">
        <span className={`confirmacao__icone ${perigo ? "" : "confirmacao__icone--neutro"}`}>
          <Icone nome={icone} tamanho={23} />
        </span>
        <p>
          {mensagem ?? (
            <>
              Deseja realmente {verbo} <strong>{nome}</strong>? {descricao}
            </>
          )}
        </p>
      </div>
      <div className="modal__rodape">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao variante={perigo ? "perigo" : "primario"} onClick={onConfirmar}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </Modal>
  );
}
