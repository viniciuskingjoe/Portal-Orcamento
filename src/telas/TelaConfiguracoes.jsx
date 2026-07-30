import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";

const CARTOES = [
  {
    id: "filiais",
    titulo: "Filiais",
    icone: "building",
    campo: "filiais",
    rotulo: "cadastradas",
    descricao: "Unidades usadas para distribuir os valores do orçamento.",
  },
  {
    id: "centros",
    titulo: "Centro de Custos",
    icone: "layers",
    campo: "centros",
    rotulo: "cadastrados",
    descricao: "Estrutura gerencial para classificação das despesas.",
  },
];

export default function TelaConfiguracoes({ configuracao, onAbrir }) {
  return (
    <main className="conteudo">
      <Cabecalho
        titulo="Configurações"
        subtitulo="Dimensões do portal. Valem para todos os planos orçamentários."
      />
      <div className="grid-modulos grid-modulos--config">
        {CARTOES.map((cartao) => {
          const total = configuracao[cartao.campo].length;
          return (
            <button
              type="button"
              className="card-modulo card-modulo--config"
              key={cartao.id}
              onClick={() => onAbrir(cartao.id)}
            >
              <span className="card-modulo__icone">
                <Icone nome={cartao.icone} tamanho={23} />
              </span>
              <span className="card-modulo__texto">
                <strong>{cartao.titulo}</strong>
                <small>
                  {total} {cartao.rotulo} · {cartao.descricao}
                </small>
              </span>
              <Icone nome="chevron" tamanho={17} />
            </button>
          );
        })}
      </div>
    </main>
  );
}
