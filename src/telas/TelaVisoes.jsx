import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";
import { resumoDaVisao } from "../dados/visao.js";

export default function TelaVisoes({ visoes, planos, nomeContabil, onAbrir, onNova, onExcluir }) {
  const planosQueUsam = (visaoId) => planos.filter((plano) => plano.visaoId === visaoId).length;

  return (
    <main className="conteudo conteudo--planos">
      <Cabecalho
        titulo="Visões"
        subtitulo="Uma visão define quais contas compõem cada módulo do orçamento. Os planos escolhem uma visão na criação."
        acao={
          <Botao onClick={onNova}>
            <Icone nome="plus" tamanho={18} />
            Criar visão
          </Botao>
        }
      />

      {visoes.length ? (
        <div className="grid-planos">
          {visoes.map((visao) => {
            const resumo = resumoDaVisao(visao);
            const emUso = planosQueUsam(visao.id);

            return (
              <article className="card-plano" key={visao.id}>
                <button
                  type="button"
                  className="card-plano__abrir"
                  onClick={() => onAbrir(visao.id)}
                  aria-label={`Abrir ${visao.nome}`}
                >
                  <span className="card-plano__icone">
                    <Icone nome="eye" />
                  </span>
                  <span className="card-plano__texto">
                    <strong>{visao.nome}</strong>
                    <small>
                      {resumo.modulos} de {resumo.totalDeModulos} módulos · {resumo.filiais}{" "}
                      {resumo.filiais === 1 ? "filial" : "filiais"} · {resumo.contas}{" "}
                      {resumo.contas === 1 ? "conta" : "contas"}
                    </small>
                    <span className="card-plano__visao">
                      <Icone nome="layers" tamanho={13} />
                      {visao.visaoContabil}{nomeContabil?.(visao.visaoContabil) ? ` — ${nomeContabil(visao.visaoContabil)}` : ""}
                    </span>
                    <span className="card-plano__visao">
                      <Icone nome="folder" tamanho={13} />
                      {emUso ? `usada por ${emUso} ${emUso === 1 ? "plano" : "planos"}` : "não usada"}
                    </span>
                  </span>
                  <span className="card-plano__seta">
                    <Icone nome="chevron" tamanho={18} />
                  </span>
                </button>
                <button
                  type="button"
                  className="card-plano__excluir"
                  onClick={() => onExcluir(visao)}
                  aria-label={`Excluir ${visao.nome}`}
                >
                  <Icone nome="trash" tamanho={18} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <EstadoVazio texto="Crie uma visão para poder criar planos orçamentários." />
      )}
    </main>
  );
}
