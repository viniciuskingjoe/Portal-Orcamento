import Cabecalho from "../componentes/Cabecalho.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import Icone from "../componentes/Icone.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { DicaEdicao } from "../componentes/FiltrosOrcamento.jsx";
import { conta as buscarConta } from "../dados/contas.js";
import { GRUPOS } from "../dados/modulos.js";
import { SEM_CENTRO, usaCentroDeCusto } from "../dados/visao.js";
import { formatarMoeda } from "../lib/formato.js";

export const TODAS_AS_CONTAS = "__todas";

// Lista de contas selecionáveis à esquerda. Serve tanto para as contas do
// módulo quanto para as receitas que servem de base ao percentual — são a mesma
// interação, com rótulos diferentes.
function PainelDeContas({
  titulo,
  descricao,
  rotuloTotal,
  codigos,
  catalogo,
  selecionado,
  aoSelecionar,
  valores,
  vazio,
}) {
  return (
    <section className="painel-selecao">
      <h3>{titulo}</h3>
      {descricao ? <p className="painel-selecao__descricao">{descricao}</p> : null}

      <button
        type="button"
        className={`selecao-item ${selecionado === TODAS_AS_CONTAS ? "is-active" : ""}`}
        aria-pressed={selecionado === TODAS_AS_CONTAS}
        onClick={() => aoSelecionar(TODAS_AS_CONTAS)}
      >
        <span>{rotuloTotal}</span>
        <b>{codigos.length}</b>
      </button>

      {codigos.map((codigo) => {
        const item = buscarConta(catalogo, codigo);
        const ativo = selecionado === codigo;
        return (
          <button
            type="button"
            key={codigo}
            className={`selecao-item selecao-item--conta ${ativo ? "is-active" : ""}`}
            aria-pressed={ativo}
            onClick={() => aoSelecionar(codigo)}
            title={item?.descricao ?? codigo}
          >
            <code>{codigo}</code>
            <span>{item?.descricao ?? "conta fora da visão contábil"}</span>
            {/* O planejado da receita é a base da conta: mostrá-lo aqui evita ter
                que sair da tela para descobrir sobre quanto o percentual incide. */}
            {valores ? (
              <em className={valores.get(codigo) ? "" : "is-zerado"}>
                {formatarMoeda(valores.get(codigo) ?? 0)}
              </em>
            ) : null}
          </button>
        );
      })}

      {!codigos.length ? <p className="sem-contas">{vazio}</p> : null}
    </section>
  );
}

export default function TelaOrcamento({
  plano,
  visao,
  modulo,
  catalogo,
  filiais,
  centros,
  contasDisponiveis,
  receitasDisponiveis,
  totaisDasReceitas,
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

  const receitas = percentual ? (receitasDisponiveis ?? []) : [];

  // Editar só faz sentido em uma célula única: uma filial e uma conta — e, no
  // módulo percentual, também uma receita: o mesmo percentual vale valores
  // diferentes conforme a receita sobre a qual incide.
  const podeEditar =
    filtros.filial !== "total" &&
    filtros.conta !== TODAS_AS_CONTAS &&
    contasDisponiveis.length > 0 &&
    (!usaCentro || filtros.centro !== SEM_CENTRO) &&
    (!percentual || (filtros.receita !== TODAS_AS_CONTAS && receitas.length > 0));

  const motivo = !contasDisponiveis.length
    ? "Nenhuma conta configurada para esta combinação. Ajuste a visão."
    : percentual && !receitas.length
      ? "Nenhuma conta de receita configurada nesta filial. Ajuste Receita de vendas na visão."
      : filtros.filial === "total"
        ? "Para lançar, escolha uma filial específica."
        : usaCentro && filtros.centro === SEM_CENTRO
          ? "Este módulo usa centro de custo: escolha um para lançar."
          : filtros.conta === TODAS_AS_CONTAS
            ? "Escolha uma conta na lista à esquerda para lançar o planejado."
            : percentual && filtros.receita === TODAS_AS_CONTAS
              ? "Escolha também a receita sobre a qual o percentual incide."
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
          {/* Módulo percentual precisa das duas dimensões, como no Scoreplan:
              sobre QUAL receita e para QUAL conta do módulo. */}
          {percentual ? (
            <PainelDeContas
              titulo="Receita (base do %)"
              descricao={`Planejado de ${plano.ano} — é sobre este valor que o percentual incide.`}
              rotuloTotal="Todas as receitas"
              codigos={receitas}
              catalogo={catalogo}
              selecionado={filtros.receita}
              aoSelecionar={(codigo) => onAlterarFiltro({ receita: codigo })}
              valores={totaisDasReceitas}
              vazio="Nenhuma receita configurada para esta filial na visão."
            />
          ) : null}

          <PainelDeContas
            titulo="Contas do módulo"
            rotuloTotal="Total do módulo"
            codigos={contasDisponiveis}
            catalogo={catalogo}
            selecionado={filtros.conta}
            aoSelecionar={(codigo) => onAlterarFiltro({ conta: codigo })}
            vazio={`Nenhuma conta para esta filial${usaCentro ? " e centro" : ""}.`}
          />
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
            prefixoCelula={`${modulo.id}|${filtros.filial}|${filtros.centro}|${filtros.conta}|${filtros.receita}`}
            {...edicao}
          />
        </section>
      </div>
    </main>
  );
}
