import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";
import Modal from "./Modal.jsx";
import { CONTAS_DEDUCAO, CONTAS_RECEITA } from "../dados/contas.js";

const ROTULO = {
  filiais: "filial",
  centros: "centro de custo",
  canais: "canal",
  deducao: "despesa",
};

const TEM_CONTAS = new Set(["canais", "deducao"]);

export default function ModalDimensao({ modal, nome, contas, onAlterarNome, onAlterarContas, onSalvar, onFechar }) {
  const vinculaContas = TEM_CONTAS.has(modal.tipo);
  const disponiveis = modal.tipo === "canais" ? CONTAS_RECEITA : CONTAS_DEDUCAO;

  return (
    <Modal
      titulo={`${modal.id ? "Editar" : "Adicionar"} ${ROTULO[modal.tipo]}`}
      onFechar={onFechar}
      largura={vinculaContas ? "760px" : "520px"}
    >
      <div className="modal__conteudo">
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(evento) => onAlterarNome(evento.target.value)} autoFocus />
        </label>

        {vinculaContas ? (
          <div className="contas-seletor">
            <div className="contas-seletor__topo">
              <span>Contas disponíveis</span>
              <small>{contas.length} selecionadas</small>
            </div>
            <div className="contas-seletor__lista">
              {disponiveis.map((conta) => {
                const marcado = contas.includes(conta.id);
                return (
                  <label className="conta-checkbox" key={conta.id}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() =>
                        onAlterarContas(
                          marcado
                            ? contas.filter((id) => id !== conta.id)
                            : [...contas, conta.id]
                        )
                      }
                    />
                    <span className="checkbox-visual">
                      <Icone nome="check" tamanho={13} />
                    </span>
                    <code>{conta.codigo}</code>
                    <span>{conta.descricao}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="modal__rodape">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={onSalvar} disabled={!nome.trim()}>
          Salvar
        </Botao>
      </div>
    </Modal>
  );
}
