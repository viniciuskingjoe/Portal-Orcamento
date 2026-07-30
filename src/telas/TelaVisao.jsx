import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { MODULOS_DESPESA, MODULOS_RECEITA } from "../dados/modulos.js";
import { resumoDaVisao, resumoDoModulo } from "../dados/visao.js";

function CardModulo({ modulo, visao, onAbrir }) {
  const resumo = resumoDoModulo(visao, modulo.id);
  const configurado = resumo.filiais > 0;

  return (
    <button
      type="button"
      className={`card-visao card-visao--${modulo.tipo} ${configurado ? "is-configurado" : ""}`}
      onClick={() => onAbrir(modulo.id)}
    >
      <span className="card-visao__icone">
        <Icone nome={modulo.icone} tamanho={19} />
      </span>
      <span className="card-visao__texto">
        <strong>{modulo.titulo}</strong>
        <small>
          {configurado
            ? `${resumo.filiais} ${resumo.filiais === 1 ? "filial" : "filiais"} · ${resumo.contas} ${
                resumo.contas === 1 ? "conta" : "contas"
              }`
            : "sem contas"}
          {resumo.usaCentro ? " · centro de custo" : ""}
        </small>
      </span>
      <span className="card-visao__grupo">{modulo.grupo}</span>
      <Icone nome="chevron" tamanho={16} />
    </button>
  );
}

export default function TelaVisao({ visao, nomeContabil, onAbrirModulo, onRenomear, onVoltar }) {
  const resumo = resumoDaVisao(visao);

  const grupos = [
    { titulo: "Receitas", modulos: MODULOS_RECEITA },
    { titulo: "Despesas", modulos: MODULOS_DESPESA },
  ];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={visao.nome}
        subtitulo={`Visão contábil ${visao.visaoContabil}${nomeContabil ? ` — ${nomeContabil}` : ""} · ${
          resumo.modulos
        } de ${resumo.totalDeModulos} módulos · ${resumo.filiais} ${
          resumo.filiais === 1 ? "filial" : "filiais"
        }`}
        onVoltar={onVoltar}
        acao={
          <button type="button" className="botao botao--secundario" onClick={onRenomear}>
            <Icone nome="edit" tamanho={16} />
            Editar
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
