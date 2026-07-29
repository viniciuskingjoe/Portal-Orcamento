import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";
import { CONTAS_DEDUCAO, CONTAS_RECEITA } from "../dados/contas.js";

export default function TelaVinculos({ tela, lista, onAdicionar, onEditar, onExcluir, onVoltar }) {
  const ehCanal = tela === "canais";
  const contas = ehCanal ? CONTAS_RECEITA : CONTAS_DEDUCAO;
  const contaMap = new Map(contas.map((conta) => [conta.id, conta]));

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={ehCanal ? "Canais" : "Dedução"}
        subtitulo={
          ehCanal
            ? "Agrupe as contas de receita que compõem cada canal de venda."
            : "Agrupe separadamente as contas usadas nas deduções de vendas."
        }
        onVoltar={onVoltar}
        acao={
          <Botao onClick={() => onAdicionar()}>
            <Icone nome="plus" tamanho={18} />
            Adicionar {ehCanal ? "canal" : "dedução"}
          </Botao>
        }
      />
      <div className="vinculos-grid">
        {lista.map((item) => (
          <article className="card-vinculo" key={item.id}>
            <div className="card-vinculo__topo">
              <div>
                <span>{ehCanal ? "Canal de venda" : "Grupo de dedução"}</span>
                <h3>{item.nome}</h3>
              </div>
              <div className="linha-crud__acoes">
                <button
                  type="button"
                  className="botao-icone"
                  onClick={() => onEditar(item)}
                  aria-label={`Editar ${item.nome}`}
                >
                  <Icone nome="edit" tamanho={18} />
                </button>
                <button
                  type="button"
                  className="botao-icone botao-icone--perigo"
                  onClick={() => onExcluir(item)}
                  aria-label={`Excluir ${item.nome}`}
                >
                  <Icone nome="trash" tamanho={18} />
                </button>
              </div>
            </div>
            <div className="card-vinculo__contas">
              {item.contas.length ? (
                item.contas.map((contaId) => {
                  const conta = contaMap.get(contaId);
                  return conta ? (
                    <div className="conta-resumo" key={contaId}>
                      <code>{conta.codigo}</code>
                      <span>{conta.descricao}</span>
                    </div>
                  ) : null;
                })
              ) : (
                <p className="sem-contas">Nenhuma conta vinculada.</p>
              )}
            </div>
            <div className="card-vinculo__rodape">
              {item.contas.length}{" "}
              {item.contas.length === 1 ? "conta vinculada" : "contas vinculadas"}
            </div>
          </article>
        ))}
        {!lista.length ? (
          <EstadoVazio texto={`Adicione ${ehCanal ? "um canal" : "uma dedução"}.`} />
        ) : null}
      </div>
    </main>
  );
}
