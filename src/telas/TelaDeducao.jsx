import Cabecalho from "../componentes/Cabecalho.jsx";
import ListaSelecao from "../componentes/ListaSelecao.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import {
  CheckOcultarCanais,
  DicaEdicao,
  FiltrosOrcamento,
} from "../componentes/FiltrosOrcamento.jsx";
import { totalCanalNoAno } from "../dados/plano.js";

const ABAS = [
  { id: "percentual", rotulo: "Percentual" },
  { id: "total", rotulo: "Total" },
];

export default function TelaDeducao({
  plano,
  filtros,
  onAlterarFiltro,
  canais,
  linhas,
  edicao,
  onVoltar,
}) {
  const ehPercentual = filtros.aba === "percentual";
  const podeEditar =
    ehPercentual &&
    filtros.filial !== "total" &&
    filtros.canal !== "total" &&
    filtros.deducao !== "total";

  const alterarOcultar = (marcado) => {
    const selecionadoSumiria =
      marcado &&
      filtros.canal !== "total" &&
      !plano.canais.find((canal) => canal.id === filtros.canal)?.manual &&
      totalCanalNoAno(plano, "vendas", filtros.filial, filtros.canal, filtros.ano) === 0;

    onAlterarFiltro({
      ocultarSemValores: marcado,
      ...(selecionadoSumiria ? { canal: "total" } : {}),
    });
  };

  const dica = !ehPercentual
    ? "Somente leitura: total = percentual planejado × receita de vendas planejada."
    : podeEditar
      ? "Edição liberada: clique no percentual planejado."
      : "Para editar, selecione filial, canal e dedução específicos.";

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo="Dedução de Vendas"
        subtitulo="Percentuais ponderados e valores calculados sobre a receita planejada."
        onVoltar={onVoltar}
      />
      <FiltrosOrcamento plano={plano} filtros={filtros} onAlterarFiltro={onAlterarFiltro} />
      <div className="orcamento-layout orcamento-layout--deducao">
        <aside className="orcamento-lateral">
          <ListaSelecao
            titulo="Canais de venda"
            itens={canais}
            selecionado={filtros.canal}
            onSelecionar={(id) => onAlterarFiltro({ canal: id })}
          />
          <CheckOcultarCanais marcado={filtros.ocultarSemValores} onAlterar={alterarOcultar} />
          <ListaSelecao
            titulo="Deduções"
            itens={plano.deducoes}
            selecionado={filtros.deducao}
            onSelecionar={(id) => onAlterarFiltro({ deducao: id })}
          />
        </aside>
        <section className="orcamento-dados">
          <div className="abas" role="tablist">
            {ABAS.map((aba) => (
              <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={filtros.aba === aba.id}
                className={filtros.aba === aba.id ? "is-active" : ""}
                onClick={() => onAlterarFiltro({ aba: aba.id })}
              >
                {aba.rotulo}
              </button>
            ))}
          </div>
          <DicaEdicao pronta={podeEditar}>{dica}</DicaEdicao>
          <TabelaOrcamento
            linhas={linhas}
            formato={ehPercentual ? "percentual" : "moeda"}
            podeEditar={podeEditar}
            prefixoCelula={`deducao|${filtros.filial}|${filtros.canal}|${filtros.deducao}|${filtros.ano}|${filtros.aba}`}
            {...edicao}
          />
        </section>
      </div>
    </main>
  );
}
