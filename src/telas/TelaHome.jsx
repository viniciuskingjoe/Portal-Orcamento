import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { MODULOS_DESPESA, MODULOS_RECEITA } from "../dados/modulos.js";
import { contasDoModulo, moduloConfigurado } from "../dados/visao.js";

function CardModulo({ modulo, visao, onAbrir }) {
  const configurado = moduloConfigurado(visao, modulo.id);
  const contas = contasDoModulo(visao, modulo.id);

  return (
    <button
      type="button"
      className={`card-modulo card-modulo--${modulo.tipo}`}
      onClick={() => onAbrir(modulo.id)}
      disabled={!configurado}
      title={configurado ? undefined : "Módulo sem contas na visão deste plano"}
    >
      <span className="card-modulo__icone">
        <Icone nome={modulo.icone} tamanho={22} />
      </span>
      <span className="card-modulo__texto">
        <strong>{modulo.titulo}</strong>
        <small>
          {configurado
            ? `${contas.length} ${contas.length === 1 ? "conta" : "contas"} · abrir planejamento`
            : "sem contas nesta visão"}
        </small>
      </span>
      <Icone nome="chevron" tamanho={17} />
    </button>
  );
}

export default function TelaHome({ plano, visao, onAbrirModulo, onAbrirConfiguracoes, onVoltar }) {
  const grupos = [
    { numero: "02", titulo: "Receitas", modulos: MODULOS_RECEITA },
    { numero: "03", titulo: "Despesas", modulos: MODULOS_DESPESA },
  ];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={plano.nome}
        subtitulo={`Período de ${plano.inicio} a ${plano.fim}${visao ? ` · visão ${visao.nome}` : ""}`}
        onVoltar={onVoltar}
      />

      <section className="secao-modulos">
        <div className="secao-modulos__cabecalho">
          <div>
            <span className="numero-secao">01</span>
            <h2>Configuração</h2>
          </div>
          <p>Dimensões deste plano.</p>
        </div>
        <div className="grid-modulos grid-modulos--config">
          <button
            type="button"
            className="card-modulo card-modulo--config"
            onClick={onAbrirConfiguracoes}
          >
            <span className="card-modulo__icone">
              <Icone nome="settings" tamanho={23} />
            </span>
            <span className="card-modulo__texto">
              <strong>Configurações</strong>
              <small>
                {plano.filiais.length} {plano.filiais.length === 1 ? "filial" : "filiais"} ·{" "}
                {plano.centros.length}{" "}
                {plano.centros.length === 1 ? "centro de custo" : "centros de custo"}
              </small>
            </span>
            <Icone nome="chevron" tamanho={17} />
          </button>
        </div>
      </section>

      {visao ? (
        grupos.map((grupo) => (
          <section className="secao-modulos" key={grupo.numero}>
            <div className="secao-modulos__cabecalho">
              <div>
                <span className="numero-secao">{grupo.numero}</span>
                <h2>{grupo.titulo}</h2>
              </div>
              <p>Planeje, compare e revise os resultados mensais.</p>
            </div>
            <div className="grid-modulos grid-modulos--orcamento">
              {grupo.modulos.map((modulo) => (
                <CardModulo key={modulo.id} modulo={modulo} visao={visao} onAbrir={onAbrirModulo} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="modulo-aviso">
          <Icone nome="info" tamanho={16} />
          Este plano não tem visão associada — nenhum módulo de orçamento está disponível.
        </p>
      )}
    </main>
  );
}
