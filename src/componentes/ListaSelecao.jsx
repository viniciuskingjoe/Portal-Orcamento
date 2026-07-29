import { formatarMoeda } from "../lib/formato.js";

export default function ListaSelecao({
  titulo,
  itens,
  selecionado,
  onSelecionar,
  totalLabel = "Total",
  mostrarValores = false,
  obterValor,
}) {
  const opcoes = [{ id: "total", nome: totalLabel }, ...itens];
  return (
    <section className="painel-selecao">
      <h3>{titulo}</h3>
      {opcoes.map((item) => {
        const ativo = selecionado === item.id;
        return (
          <button
            type="button"
            key={item.id}
            className={`selecao-item ${ativo ? "is-active" : ""}`}
            aria-pressed={ativo}
            onClick={() => onSelecionar(item.id)}
          >
            <span>{item.nome}</span>
            {mostrarValores ? <b>{formatarMoeda(obterValor(item.id))}</b> : null}
          </button>
        );
      })}
    </section>
  );
}
