import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";

export default function TelaPlanos({ planos, visoes, onAbrir, onNovo, onExcluir }) {
  const nomeDaVisao = (visaoId) =>
    visoes.find((visao) => visao.id === visaoId)?.nome ?? "sem visão";

  return (
    <main className="conteudo conteudo--planos">
      <Cabecalho
        titulo="Planos Orçamentários"
        subtitulo="Crie versões independentes e acompanhe diferentes cenários do orçamento."
        acao={
          <Botao onClick={onNovo}>
            <Icone nome="plus" tamanho={18} />
            Novo plano
          </Botao>
        }
      />
      <div className="planos-meta">
        <span>
          {planos.length} {planos.length === 1 ? "plano" : "planos"}
        </span>
        <span>Selecione um plano para acessar seus módulos</span>
      </div>
      {planos.length ? (
        <div className="grid-planos">
          {planos.map((plano) => (
            <article className="card-plano" key={plano.id}>
              <button
                type="button"
                className="card-plano__abrir"
                onClick={() => onAbrir(plano.id)}
                aria-label={`Abrir ${plano.nome}`}
              >
                <span className="card-plano__icone">
                  <Icone nome="calendar" />
                </span>
                <span className="card-plano__texto">
                  <strong>{plano.nome}</strong>
                  <small>
                    01/01/{plano.inicio} até 31/12/{plano.fim}
                  </small>
                  <span className="card-plano__visao">
                    <Icone nome="eye" tamanho={13} />
                    {nomeDaVisao(plano.visaoId)}
                  </span>
                </span>
                <span className="card-plano__seta">
                  <Icone nome="chevron" tamanho={18} />
                </span>
              </button>
              <button
                type="button"
                className="card-plano__excluir"
                onClick={() => onExcluir(plano)}
                aria-label={`Excluir ${plano.nome}`}
              >
                <Icone nome="trash" tamanho={18} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EstadoVazio texto="Adicione um plano para começar seu planejamento." />
      )}
    </main>
  );
}
