import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";

// "há 3 minutos", "ontem" — quem publicou há pouco quer saber se foi ANTES ou
// DEPOIS da última alteração, e uma data completa obriga a fazer essa conta de
// cabeça.
function quandoFoi(iso) {
  if (!iso) return null;
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 60 * 24) return `há ${Math.floor(minutos / 60)} h`;

  const dias = Math.floor(minutos / (60 * 24));
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function TelaPlanos({
  planos,
  visoes,
  podePublicar = false,
  mostrarInativos = false,
  onAbrir,
  onNovo,
  onAlternarSituacao,
  onAlternarInativos,
}) {
  const nomeDaVisao = (visaoId) =>
    visoes.find((visao) => visao.id === visaoId)?.nome ?? "sem visão";

  // Inativo fica fora do caminho por padrão: quem abre esta tela quer o cenário
  // que vale, não o histórico. O interruptor traz de volta quando for preciso.
  const inativos = planos.filter((plano) => plano.situacao === "inativo").length;
  const visiveis = mostrarInativos
    ? planos
    : planos.filter((plano) => plano.situacao !== "inativo");

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
          {visiveis.length} {visiveis.length === 1 ? "plano" : "planos"}
        </span>
        <span>Selecione um plano para acessar seus módulos</span>
        {inativos ? (
          <button type="button" className="botao-texto" onClick={onAlternarInativos}>
            {mostrarInativos
              ? "Ocultar inativos"
              : `Mostrar ${inativos} ${inativos === 1 ? "inativo" : "inativos"}`}
          </button>
        ) : null}
      </div>
      {visiveis.length ? (
        <div className="grid-planos">
          {visiveis.map((plano) => {
            const inativo = plano.situacao === "inativo";
            return (
            <article className={`card-plano ${inativo ? "is-inativo" : ""}`} key={plano.id}>
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
                  <small>Ano {plano.ano}</small>
                  <span className="card-plano__visao">
                    <Icone nome="eye" tamanho={13} />
                    {nomeDaVisao(plano.visaoId)}
                  </span>
                </span>
                <span className="card-plano__seta">
                  <Icone nome="chevron" tamanho={18} />
                </span>
              </button>

              {/* Publicar manda o planejado para o orçamento do Linx, que é de
                  onde o Power BI lê. Fica fora do botão de abrir para o clique
                  não ser ambíguo, e só para quem administra: o efeito sai do
                  portal e passa a valer para quem consulta o BI. */}
              {podePublicar ? (
                <div className="card-plano__publicacao">
                  <span className="card-plano__publicado">
                    {plano.publicadoEm ? (
                      <>
                        <Icone nome="check" tamanho={13} />
                        Sincronizado {quandoFoi(plano.publicadoEm)}
                        {plano.publicadoLinhas != null ? ` · ${plano.publicadoLinhas} linhas` : ""}
                      </>
                    ) : (
                      <>
                        <Icone nome="info" tamanho={13} />
                        Nunca sincronizado com o Linx
                      </>
                    )}
                  </span>
                </div>
              ) : null}

              {/* Desativar, nao excluir: orcamento antigo e referencia, e um
                  clique nao pode levar o trabalho de quem montou o cenario. */}
              <button
                type="button"
                className="card-plano__excluir"
                onClick={() => onAlternarSituacao(plano)}
                aria-label={`${inativo ? "Reativar" : "Desativar"} ${plano.nome}`}
                title={inativo ? "Reativar este plano" : "Desativar — o planejado continua guardado"}
              >
                <Icone nome={inativo ? "check" : "archive"} tamanho={18} />
              </button>
            </article>
            );
          })}
        </div>
      ) : (
        <EstadoVazio texto="Adicione um plano para começar seu planejamento." />
      )}
    </main>
  );
}
