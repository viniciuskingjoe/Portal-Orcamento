import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { DicaEdicao, FiltrosOrcamento } from "../componentes/FiltrosOrcamento.jsx";
import { conta as buscarConta } from "../dados/contas.js";
import { contasDoModulo } from "../dados/visao.js";

export default function TelaOrcamento({
  plano,
  visao,
  filiais,
  catalogo,
  modulo,
  filtros,
  onAlterarFiltro,
  linhas,
  carregandoRealizado,
  edicao,
  onVoltar,
}) {
  const contas = contasDoModulo(visao, modulo.id);
  const podeEditar = filtros.filial !== "total" && contas.length > 0;

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`Visão ${visao.nome} · planejado digitado aqui, realizado vindo do ERP.`}
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
            contas.map((codigo) => {
              const item = buscarConta(catalogo, codigo);
              return (
                <span className="chip-conta" key={codigo}>
                  <code>{codigo}</code>
                  {item ? <span>{item.descricao}</span> : <span className="negativo">fora da visão contábil</span>}
                </span>
              );
            })
          ) : (
            <p className="sem-contas">
              Nenhuma conta vinculada na visão — planejado e realizado ficam zerados.
            </p>
          )}
        </div>
      </details>

      {carregandoRealizado ? <Carregando texto="Carregando realizado do ERP…" /> : null}

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
