import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";

const DESCRICAO = {
  filiais: {
    titulo: "Filiais",
    singular: "filial",
    texto: "Unidades usadas para distribuir os valores do orçamento.",
  },
  centros: {
    titulo: "Centro de Custos",
    singular: "centro de custo",
    texto: "Estrutura gerencial para classificação das despesas.",
  },
};

export default function TelaCrud({ tela, lista, onAdicionar, onEditar, onExcluir, onVoltar }) {
  const dados = DESCRICAO[tela];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={dados.titulo}
        subtitulo={dados.texto}
        onVoltar={onVoltar}
        acao={
          <Botao onClick={() => onAdicionar()}>
            <Icone nome="plus" tamanho={18} />
            Adicionar {dados.singular}
          </Botao>
        }
      />
      <div className="lista-crud">
        <div className="lista-crud__topo">
          <span>Nome</span>
          <span>Ações</span>
        </div>
        {lista.map((item, index) => (
          <div className="linha-crud" key={item.id}>
            <div className="linha-crud__nome">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.nome}</strong>
            </div>
            <div className="linha-crud__acoes">
              <button
                type="button"
                className="botao-icone"
                onClick={() => onEditar(item)}
                aria-label={`Renomear ${item.nome}`}
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
        ))}
        {!lista.length ? <EstadoVazio texto={`Adicione ${dados.singular}.`} /> : null}
      </div>
    </main>
  );
}
