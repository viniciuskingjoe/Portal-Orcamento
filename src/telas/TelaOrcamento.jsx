import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import { DicaEdicao, FiltrosOrcamento } from "../componentes/FiltrosOrcamento.jsx";
import { conta as buscarConta } from "../dados/contas.js";
import { contasDoModulo } from "../dados/visao.js";

export default function TelaOrcamento({
  plano,
  visao,
  filiais,
  modulo,
  filtros,
  onAlterarFiltro,
  linhas,
  edicao,
  onVoltar,
}) {
  const contas = contasDoModulo(visao, modulo.id);
  const podeEditar = filtros.filial !== "total" && contas.length > 0;

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`Visão ${visao.nome} · planejamento mensal, realizado e comparativo histórico.`}
        onVoltar={onVoltar}
      />

      <FiltrosOrcamento
        plano={plano}
        filiais={filiais}
        filtros={filtros}
        onAlterarFiltro={onAlterarFiltro}
      />

      <details className="contas-do-modulo">
        <summary>
          <Icone nome="chevron" tamanho={14} />
          {contas.length} {contas.length === 1 ? "conta compõe" : "contas compõem"} este módulo
        </summary>
        <div className="contas-do-modulo__lista">
          {contas.length ? (
            contas.map((contaId) => {
              const item = buscarConta(contaId);
              return (
                <span className="chip-conta" key={contaId}>
                  <code>{item?.codigo ?? contaId}</code>
                  {item ? <span>{item.descricao}</span> : null}
                </span>
              );
            })
          ) : (
            <p className="sem-contas">
              Nenhuma conta vinculada na visão — os valores ficam zerados.
            </p>
          )}
        </div>
      </details>

      <DicaEdicao pronta={podeEditar}>
        {!contas.length
          ? "Vincule contas a este módulo na visão para poder planejar."
          : podeEditar
            ? "Edição liberada: clique em um valor da coluna Planejado."
            : "Para editar, selecione uma filial específica."}
      </DicaEdicao>

      <TabelaOrcamento
        linhas={linhas}
        podeEditar={podeEditar}
        prefixoCelula={`${modulo.id}|${filtros.filial}|${filtros.ano}`}
        {...edicao}
      />
    </main>
  );
}
