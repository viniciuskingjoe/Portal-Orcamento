import Botao from "./Botao.jsx";
import Modal from "./Modal.jsx";

export default function ModalVisao({
  edicao,
  nome,
  visaoContabil,
  visoesContabeis,
  onAlterarNome,
  onAlterarVisaoContabil,
  onSalvar,
  onFechar,
}) {
  const escolhida = visoesContabeis.find((item) => item.id === visaoContabil) ?? null;

  return (
    <Modal
      titulo={edicao ? "Editar visão" : "Criar visão"}
      onFechar={onFechar}
      largura="560px"
    >
      <form
        className="modal__form"
        onSubmit={(evento) => {
          evento.preventDefault();
          onSalvar();
        }}
      >
        <div className="modal__conteudo">
          <label className="campo">
            <span>Visão contábil do Linx</span>
            <select
              value={visaoContabil ?? ""}
              onChange={(evento) => onAlterarVisaoContabil(evento.target.value || null)}
            >
              <option value="">Selecione…</option>
              {visoesContabeis.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.id} — {item.nome} ({item.folhas} contas)
                </option>
              ))}
            </select>
          </label>

          {escolhida ? (
            <p className="campo__ajuda">
              {escolhida.classificacoes} classificações · {escolhida.folhas} contas analíticas
            </p>
          ) : null}

          <label className="campo">
            <span>Nome da visão no portal</span>
            <input
              value={nome}
              onChange={(evento) => onAlterarNome(evento.target.value)}
              placeholder={escolhida ? `Ex.: ${escolhida.nome} 2026` : "Ex.: DRE Gerencial 2026"}
              autoFocus
            />
          </label>

          <p className="modal__nota">
            A visão contábil define quais contas os módulos oferecem. Só ela muda a estrutura — o
            nome aqui é como o portal chama essa visão.
          </p>

          {edicao ? (
            <p className="modal__aviso">
              Trocar a visão contábil descarta as contas já escolhidas nos módulos: os códigos de
              uma visão não existem na outra.
            </p>
          ) : null}
        </div>

        <div className="modal__rodape">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <button
            type="submit"
            className="botao botao--primario"
            disabled={!nome.trim() || !visaoContabil}
          >
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
