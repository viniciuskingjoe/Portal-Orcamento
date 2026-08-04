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
                {/* Mesma faixa do cartão de plano: rótulo, alvo grande e
                    separada da área que abre. Excluir visão em uso levaria os
                    módulos dos planos junto, então o botão diz quando não dá. */}
                <div className="card-plano__acoes">
                  <button
                    type="button"
                    className="card-plano__acao card-plano__acao--perigo"
                    onClick={() => onExcluir(visao)}
                    disabled={Boolean(emUso)}
                    title={
                      emUso
                        ? `Não dá: ${emUso} ${emUso === 1 ? "plano usa" : "planos usam"} esta visão`
                        : "Excluir esta visão"
                    }
                  >
                    <Icone nome="trash" tamanho={15} />
                    Excluir
                  </button>
                </div>
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
