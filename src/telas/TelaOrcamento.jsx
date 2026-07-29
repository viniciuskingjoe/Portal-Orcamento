import Cabecalho from "../componentes/Cabecalho.jsx";
import ListaSelecao from "../componentes/ListaSelecao.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import {
  CheckOcultarCanais,
  DicaEdicao,
  FiltrosOrcamento,
} from "../componentes/FiltrosOrcamento.jsx";
import { MODULOS } from "../dados/seeds.js";
import { totalCanalNoAno } from "../dados/plano.js";

export default function TelaOrcamento({
  plano,
  modulo,
  filtros,
  onAlterarFiltro,
  canais,
  linhas,
  edicao,
  onVoltar,
}) {
  const podeEditar = filtros.filial !== "total" && filtros.canal !== "total";

  const obterValorCanal = (id) => {
    const ids = id === "total" ? plano.canais.map((canal) => canal.id) : [id];
    return ids.reduce(
      (soma, canalId) => soma + totalCanalNoAno(plano, modulo, filtros.filial, canalId, filtros.ano),
      0
    );
  };

  // Ao ligar o filtro, um canal zerado que estivesse selecionado sumiria da
  // lista e a tabela ficaria presa em uma seleção invisível.
  const alterarOcultar = (marcado) => {
    const selecionadoSumiria =
      marcado &&
      filtros.canal !== "total" &&
      !plano.canais.find((canal) => canal.id === filtros.canal)?.manual &&
      totalCanalNoAno(plano, modulo, filtros.filial, filtros.canal, filtros.ano) === 0;

    onAlterarFiltro({
      ocultarSemValores: marcado,
      ...(selecionadoSumiria ? { canal: "total" } : {}),
    });
  };

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo={MODULOS[modulo].titulo}
        subtitulo="Planejamento mensal, realizado e comparativo histórico."
        onVoltar={onVoltar}
      />
      <FiltrosOrcamento plano={plano} filtros={filtros} onAlterarFiltro={onAlterarFiltro} />
      <div className="orcamento-layout">
        <aside className="orcamento-lateral">
          <ListaSelecao
            titulo="Canais de venda"
            itens={canais}
            selecionado={filtros.canal}
            onSelecionar={(id) => onAlterarFiltro({ canal: id })}
            mostrarValores
            obterValor={obterValorCanal}
          />
          <CheckOcultarCanais marcado={filtros.ocultarSemValores} onAlterar={alterarOcultar} />
        </aside>
        <section className="orcamento-dados">
          <DicaEdicao pronta={podeEditar}>
            {podeEditar
              ? "Edição liberada: clique em um valor da coluna Planejado."
              : "Para editar, selecione uma filial e um canal específicos."}
          </DicaEdicao>
          <TabelaOrcamento
            linhas={linhas}
            podeEditar={podeEditar}
            prefixoCelula={`${modulo}|${filtros.filial}|${filtros.canal}|${filtros.ano}`}
            {...edicao}
          />
        </section>
      </div>
    </main>
  );
}
