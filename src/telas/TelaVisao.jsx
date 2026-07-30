import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { MODULOS_DESPESA, MODULOS_RECEITA } from "../dados/modulos.js";
import { contasDoModulo, resumoDaVisao } from "../dados/visao.js";

function CardModulo({ modulo, visao, onAbrir }) {
  const contas = contasDoModulo(visao, modulo.id);

  return (
    <button
      type="button"
      className={`card-visao card-visao--${modulo.tipo} ${contas.length ? "is-configurado" : ""}`}
      onClick={() => onAbrir(modulo.id)}
    >
      <span className="card-visao__icone">
        <Icone nome={modulo.icone} tamanho={19} />
      </span>
      <span className="card-visao__texto">
        <strong>{modulo.titulo}</strong>
        <small>
          {contas.length
            ? `${contas.length} ${contas.length === 1 ? "conta" : "contas"}`
            : "sem contas"}
        </small>
      </span>
      <Icone nome="chevron" tamanho={16} />
    </button>
  );
}

export default function TelaVisao({ visao, onAbrirModulo, onRenomear, onVoltar }) {
  const resumo = resumoDaVisao(visao);

  const grupos = [
    { titulo: "Receitas", modulos: MODULOS_RECEITA },
    { titulo: "Despesas", modulos: MODULOS_DESPESA },
  ];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={visao.nome}
        subtitulo={`${resumo.modulos} de ${resumo.totalDeModulos} módulos configurados · ${resumo.contas} ${
          resumo.contas === 1 ? "conta" : "contas"
        } vinculadas`}
        onVoltar={onVoltar}
        acao={
          <button type="button" className="botao botao--secundario" onClick={onRenomear}>
            <Icone nome="edit" tamanho={16} />
            Renomear
          </button>
        }
      />

      {grupos.map((grupo) => (
        <section className="secao-visao" key={grupo.titulo}>
          <h2>{grupo.titulo}</h2>
          <div className="grid-visao">
            {grupo.modulos.map((modulo) => (
              <CardModulo key={modulo.id} modulo={modulo} visao={visao} onAbrir={onAbrirModulo} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
