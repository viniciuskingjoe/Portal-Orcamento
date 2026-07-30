import Cabecalho from "../componentes/Cabecalho.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import Icone from "../componentes/Icone.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { DicaEdicao } from "../componentes/FiltrosOrcamento.jsx";
import { conta as buscarConta } from "../dados/contas.js";
import { GRUPOS } from "../dados/modulos.js";
import { SEM_CENTRO, usaCentroDeCusto } from "../dados/visao.js";

export const TODAS_AS_CONTAS = "__todas";

export default function TelaOrcamento({
  plano,
  visao,
  modulo,
  catalogo,
  filiais,
  centros,
  contasDisponiveis,
  filiaisIgnoradas,
  filtros,
  onAlterarFiltro,
  linhas,
  carregandoRealizado,
  edicao,
  onVoltar,
}) {
  const usaCentro = usaCentroDeCusto(visao, modulo.id);
  const grupo = GRUPOS[modulo.grupo];
  const percentual = modulo.percentual === true;

  // Percentual sobre receita zero não vira valor nenhum. Sem dizer isso, a
  // coluna em reais fica em 0,00 com o percentual digitado ao lado, e parece
  // que a digitação não pegou.
  const totalDaTabela = linhas.find((linha) => linha.id === "total");
  const semBase = percentual && !totalDaTabela?.base;

  // Editar só faz sentido em uma célula única: uma filial e uma conta. Em
  // "Total" o valor é soma de várias chaves e não há onde gravar.
  const podeEditar =
    filtros.filial !== "total" &&
    filtros.conta !== TODAS_AS_CONTAS &&
    contasDisponiveis.length > 0 &&
    (!usaCentro || filtros.centro !== SEM_CENTRO);

  const motivo = !contasDisponiveis.length
    ? "Nenhuma conta configurada para esta combinação. Ajuste a visão."
    : filtros.filial === "total"
      ? "Para lançar, escolha uma filial específica."
      : usaCentro && filtros.centro === SEM_CENTRO
        ? "Este módulo usa centro de custo: escolha um para lançar."
        : filtros.conta === TODAS_AS_CONTAS
          ? "Escolha uma conta na lista à esquerda para lançar o planejado."
          : `Digite na coluna Planejado${percentual ? " %" : ""} — Enter grava e desce · arraste o canto da célula (ou Ctrl+Enter) para repetir nos outros meses · Ctrl+D copia o mês de cima · Esc cancela.`;

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`${plano.nome} · ${plano.ano} · visão ${visao.nome}`}
        onVoltar={onVoltar}
      />

      <div className="filtros-orcamento">
        <label>
          <span>Filial</span>
          {/* "Total" é o total das filiais EM USO, não do ERP inteiro. Dizer
              "todas" faria o número parecer errado contra qualquer relatório que
              não filtre filial. */}
          <select
            value={filtros.filial}
            onChange={(evento) => onAlterarFiltro({ filial: evento.target.value })}
          >
            <option value="total">
              Total — {filiais.length} {filiais.length === 1 ? "filial em uso" : "filiais em uso"}
            </option>
            {filiais.map((filial) => (
              <option value={filial.id} key={filial.id}>
                {filial.nome}
              </option>
            ))}
          </select>
        </label>

        {usaCentro ? (
          <label>
            <span>Centro de custo</span>
            <select
              value={filtros.centro}
              onChange={(evento) => onAlterarFiltro({ centro: evento.target.value })}
            >
              <option value={SEM_CENTRO}>Total — todos os centros</option>
              {centros.map((centro) => (
                <option value={centro.id} key={centro.id}>
                  {centro.id} — {centro.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {/* O período é o ano do plano — não há o que escolher. */}
        <label>
          <span>Período</span>
          <output className="campo-fixo">
            Janeiro a Dezembro de {plano.ano}
            <span className={`chip chip--${grupo?.chip ?? "receita"}`}>{modulo.grupo}</span>
          </output>
        </label>
      </div>

      {carregandoRealizado ? <Carregando texto="Carregando realizado do ERP…" /> : null}

      {/* Sem este aviso o total sai menor que o do ERP sem nada na tela explicar
          por quê — foi exatamente o que gerou dúvida contra o Scoreplan. */}
      {filiaisIgnoradas?.length ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          <span>
            {filiaisIgnoradas.length}{" "}
            {filiaisIgnoradas.length === 1
              ? "filial tem movimento em " + plano.ano + " ou em " + (plano.ano - 1) + " e está fora"
              : "filiais têm movimento em " + plano.ano + " ou em " + (plano.ano - 1) + " e estão fora"}{" "}
            das filiais em uso, então não entram nestes totais (nem no ano anterior):{" "}
            <strong>{filiaisIgnoradas.map((f) => f.nome ?? f.id).join(", ")}</strong>. Ajuste em
            Configurações → Filiais.
          </span>
        </p>
      ) : null}

      <div className="orcamento-layout">
        {/* Lista de contas à esquerda, como no ERP: escolhe-se a conta e lança-se
            o planejado dela. Só contas analíticas — as sintéticas não recebem
            lançamento. */}
        <aside className="orcamento-lateral">
          <section className="painel-selecao">
            <h3>Contas do módulo</h3>
            <button
              type="button"
              className={`selecao-item ${filtros.conta === TODAS_AS_CONTAS ? "is-active" : ""}`}
              aria-pressed={filtros.conta === TODAS_AS_CONTAS}
              onClick={() => onAlterarFiltro({ conta: TODAS_AS_CONTAS })}
            >
              <span>Total do módulo</span>
              <b>{contasDisponiveis.length}</b>
            </button>

            {contasDisponiveis.map((codigo) => {
              const item = buscarConta(catalogo, codigo);
              const ativo = filtros.conta === codigo;
              return (
                <button
                  type="button"
                  key={codigo}
                  className={`selecao-item selecao-item--conta ${ativo ? "is-active" : ""}`}
                  aria-pressed={ativo}
                  onClick={() => onAlterarFiltro({ conta: codigo })}
                  title={item?.descricao ?? codigo}
                >
                  <code>{codigo}</code>
                  <span>{item?.descricao ?? "conta fora da visão contábil"}</span>
                </button>
              );
            })}

            {!contasDisponiveis.length ? (
              <p className="sem-contas">
                Nenhuma conta para esta filial{usaCentro ? " e centro" : ""}.
              </p>
            ) : null}
          </section>
        </aside>

        <section className="orcamento-dados">
          <DicaEdicao pronta={podeEditar}>{motivo}</DicaEdicao>

          {semBase ? (
            <p className="modulo-aviso modulo-aviso--atencao">
              <Icone nome="info" tamanho={16} />
              <span>
                Este módulo é lançado em percentual sobre a receita de vendas planejada, e não há
                receita planejada para {filtros.filial === "total" ? "estas filiais" : "esta filial"}{" "}
                em {plano.ano}. Enquanto isso, a coluna em reais fica zerada. Lance Receita de vendas
                primeiro.
              </span>
            </p>
          ) : null}

          <TabelaOrcamento
            linhas={linhas}
            percentual={percentual}
            podeEditar={podeEditar}
            prefixoCelula={`${modulo.id}|${filtros.filial}|${filtros.centro}|${filtros.conta}`}
            {...edicao}
          />
        </section>
      </div>
    </main>
  );
}
