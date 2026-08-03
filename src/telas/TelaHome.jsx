import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { MODULOS_DESPESA, MODULOS_RECEITA } from "../dados/modulos.js";
import { moduloConfigurado, resumoDoModulo } from "../dados/visao.js";

function CardModulo({ modulo, visao, onAbrir }) {
  const configurado = moduloConfigurado(visao, modulo.id);
  const resumo = resumoDoModulo(visao, modulo.id);

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
            ? `${resumo.filiais} ${resumo.filiais === 1 ? "filial" : "filiais"} · ${resumo.contas} ${
                resumo.contas === 1 ? "conta" : "contas"
              }${resumo.usaCentro ? " · por centro de custo" : ""}`
            : "sem contas nesta visão"}
        </small>
      </span>
      <Icone nome="chevron" tamanho={17} />
    </button>
  );
}

export default function TelaHome({
  plano,
  visao,
  modulosVisiveis,
  podeVerDre = true,
  onAbrirModulo,
  onAbrirDre,
  onVoltar,
}) {
  // Recorta pelo que a permissão deixa ver. Mostrar o cartão de um módulo que a
  // pessoa não abre é oferecer uma porta trancada.
  const permitido = (lista) =>
    modulosVisiveis
      ? lista.filter((modulo) => modulosVisiveis.some((item) => item.id === modulo.id))
      : lista;

  const grupos = [
    { numero: "01", titulo: "Receitas", modulos: permitido(MODULOS_RECEITA) },
    { numero: "02", titulo: "Despesas", modulos: permitido(MODULOS_DESPESA) },
  ].filter((grupo) => grupo.modulos.length);

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={plano.nome}
        subtitulo={`Ano ${plano.ano}${visao ? ` · visão ${visao.nome}` : ""}`}
        onVoltar={onVoltar}
      />

      {visao ? (
        <>
          {grupos.map((grupo) => (
            <section className="secao-modulos" key={grupo.numero}>
              <div className="secao-modulos__cabecalho">
                <div>
                  <span className="numero-secao">{grupo.numero}</span>
                  <h2>{grupo.titulo}</h2>
                </div>
                <p>Escolha a conta na lateral e lance o planejado mês a mês.</p>
              </div>
              <div className="grid-modulos grid-modulos--orcamento">
                {grupo.modulos.map((modulo) => (
                  <CardModulo
                    key={modulo.id}
                    modulo={modulo}
                    visao={visao}
                    onAbrir={onAbrirModulo}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* O DRE não é um módulo que se orça: é onde os outros fecham. Fica
              como seção própria, no fim, que é a ordem em que se usa. Some para
              quem não vê todos os módulos: sem um deles, os subtotais deixam de
              ser o resultado da empresa. */}
          {podeVerDre ? (
          <section className="secao-modulos">
            <div className="secao-modulos__cabecalho">
              <div>
                <span className="numero-secao">03</span>
                <h2>Resultado</h2>
              </div>
              <p>Os módulos acima consolidados, com margem e participação.</p>
            </div>
            <div className="grid-modulos grid-modulos--orcamento">
              <button type="button" className="card-modulo card-modulo--receita" onClick={onAbrirDre}>
                <span className="card-modulo__icone">
                  <Icone nome="chart" tamanho={22} />
                </span>
                <span className="card-modulo__texto">
                  <strong>DRE</strong>
                  <small>planejado, realizado e ano anterior por linha do resultado</small>
                </span>
                <Icone nome="chevron" tamanho={17} />
              </button>
            </div>
          </section>
          ) : null}
        </>
      ) : (
        <p className="modulo-aviso">
          <Icone nome="info" tamanho={16} />
          Este plano não tem visão associada — nenhum módulo de orçamento está disponível.
        </p>
      )}
    </main>
  );
}
