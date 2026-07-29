import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { MODULOS, MODULOS_CONFIG, MODULOS_ORCAMENTO } from "../dados/seeds.js";

const CONTAGEM = {
  filiais: { campo: "filiais", rotulo: "cadastradas" },
  centros: { campo: "centros", rotulo: "cadastrados" },
  canais: { campo: "canais", rotulo: "configurados" },
  deducao: { campo: "deducoes", rotulo: "configuradas" },
};

function CardModulo({ id, plano, onAbrir }) {
  const contagem = CONTAGEM[id];
  const legenda = contagem
    ? `${plano[contagem.campo].length} ${contagem.rotulo}`
    : "Abrir planejamento mensal";

  return (
    <button
      type="button"
      className={`card-modulo card-modulo--${MODULOS[id].tipo}`}
      onClick={() => onAbrir(id)}
    >
      <span className="card-modulo__icone">
        <Icone nome={MODULOS[id].icone} tamanho={23} />
      </span>
      <span className="card-modulo__texto">
        <strong>{MODULOS[id].titulo}</strong>
        <small>{legenda}</small>
      </span>
      <Icone nome="chevron" tamanho={17} />
    </button>
  );
}

export default function TelaHome({ plano, onAbrirModulo, onVoltar }) {
  const secoes = [
    {
      numero: "01",
      titulo: "Configuração",
      descricao: "Estruture as dimensões que formam este plano.",
      modulos: MODULOS_CONFIG,
      classe: "grid-modulos--config",
    },
    {
      numero: "02",
      titulo: "Orçamentos",
      descricao: "Planeje, compare e revise os resultados mensais.",
      modulos: MODULOS_ORCAMENTO,
      classe: "grid-modulos--orcamento",
    },
  ];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={plano.nome}
        subtitulo={`Período de ${plano.inicio} a ${plano.fim}`}
        onVoltar={onVoltar}
      />
      {secoes.map((secao) => (
        <section className="secao-modulos" key={secao.numero}>
          <div className="secao-modulos__cabecalho">
            <div>
              <span className="numero-secao">{secao.numero}</span>
              <h2>{secao.titulo}</h2>
            </div>
            <p>{secao.descricao}</p>
          </div>
          <div className={`grid-modulos ${secao.classe}`}>
            {secao.modulos.map((id) => (
              <CardModulo key={id} id={id} plano={plano} onAbrir={onAbrirModulo} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
