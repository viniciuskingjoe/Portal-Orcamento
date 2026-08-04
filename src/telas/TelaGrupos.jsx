import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";

// ============================================================================
// GRUPOS DE CENTRO DE CUSTO
//
// Um grupo junta centros e as contas que interessam para lê-los — "Fábrica",
// "Lojas", "Administrativo" — e serve de lente sobre o DRE.
//
// NÃO é visão. A visão diz o que cada módulo ORÇA; o grupo é recorte de LEITURA
// por cima do que já foi orçado. Por isso mora em Configurações, junto das
// filiais em uso, e não dentro da visão.
//
// Um centro pode estar em vários grupos: "020 E-COMMERCE" cabe em "Digital" e
// em "Comercial" ao mesmo tempo, e exigir exclusividade obrigaria a escolher uma
// hierarquia só.
// ============================================================================

export default function TelaGrupos({
  grupos,
  centros,
  podeEditar = false,
  onAbrir,
  onNovo,
  onExcluir,
  onVoltar,
}) {
  const nomeDoCentro = (id) => centros.find((centro) => centro.id === id)?.nome ?? id;

  return (
    <main className="conteudo">
      <Cabecalho
        titulo="Grupos de centro de custo"
        subtitulo="Recortes para ler o DRE — a visão continua definindo o que cada módulo orça."
        onVoltar={onVoltar}
        acao={
          podeEditar ? (
            <Botao onClick={onNovo}>
              <Icone nome="plus" tamanho={18} />
              Novo grupo
            </Botao>
          ) : null
        }
      />

      {grupos.length ? (
        <div className="grid-planos">
          {grupos.map((grupo) => (
            <article className="card-plano" key={grupo.id}>
              <button
                type="button"
                className="card-plano__abrir"
                onClick={() => onAbrir(grupo.id)}
                aria-label={`Abrir ${grupo.nome}`}
              >
                <span className="card-plano__icone">
                  <Icone nome="layers" />
                </span>
                <span className="card-plano__texto">
                  <strong>{grupo.nome}</strong>
                  <small>
                    {grupo.centros.length}{" "}
                    {grupo.centros.length === 1 ? "centro" : "centros"} ·{" "}
                    {grupo.contas.length} {grupo.contas.length === 1 ? "conta" : "contas"}
                  </small>
                  {/* Os nomes dos centros, não os códigos: é o que diz se o
                      grupo é o que se pensa que é sem precisar abri-lo. */}
                  <span className="card-plano__visao">
                    <Icone nome="folder" tamanho={13} />
                    {grupo.centros.length
                      ? grupo.centros.slice(0, 3).map(nomeDoCentro).join(", ") +
                        (grupo.centros.length > 3 ? ` +${grupo.centros.length - 3}` : "")
                      : "nenhum centro escolhido"}
                  </span>
                </span>
                <span className="card-plano__seta">
                  <Icone nome="chevron" tamanho={18} />
                </span>
              </button>

              {podeEditar ? (
                <div className="card-plano__acoes">
                  <button
                    type="button"
                    className="card-plano__acao card-plano__acao--perigo"
                    onClick={() => onExcluir(grupo)}
                    title="Excluir este grupo"
                  >
                    <Icone nome="trash" tamanho={15} />
                    Excluir
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EstadoVazio
          texto={
            podeEditar
              ? "Nenhum grupo ainda. Crie um para ler o DRE por conjunto de centros."
              : "Nenhum grupo cadastrado."
          }
        />
      )}
    </main>
  );
}
