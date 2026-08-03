import Cabecalho from "../componentes/Cabecalho.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import Icone from "../componentes/Icone.jsx";
import Seletor from "../componentes/Seletor.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { DicaEdicao } from "../componentes/FiltrosOrcamento.jsx";
import { conta as buscarConta } from "../dados/contas.js";
import { GRUPOS } from "../dados/modulos.js";
import { SEM_CENTRO, usaCentroDeCusto } from "../dados/visao.js";
import { formatarMoeda } from "../lib/formato.js";

export const TODAS_AS_CONTAS = "__todas";

// Painel de seleção da lateral. Serve às contas do módulo, às receitas que dão
// base ao percentual e aos centros de custo — é a mesma interação, com rótulos
// diferentes, e ficar lado a lado é o que deixa as dimensões visíveis de uma vez.
function PainelSelecao({ titulo, descricao, rotuloTotal, valorTotal, itens, selecionado, aoSelecionar, vazio }) {
  return (
    <section className="painel-selecao">
      <h3>{titulo}</h3>
      {descricao ? <p className="painel-selecao__descricao">{descricao}</p> : null}

      <button
        type="button"
        className={`selecao-item ${selecionado === valorTotal ? "is-active" : ""}`}
        aria-pressed={selecionado === valorTotal}
        onClick={() => aoSelecionar(valorTotal)}
      >
        <span>{rotuloTotal}</span>
        <b>{itens.length}</b>
      </button>

      {itens.map((item) => {
        const ativo = selecionado === item.codigo;
        return (
          <button
            type="button"
            key={item.codigo}
            className={`selecao-item selecao-item--conta ${ativo ? "is-active" : ""}`}
            aria-pressed={ativo}
            onClick={() => aoSelecionar(item.codigo)}
            title={item.descricao ?? item.codigo}
          >
            <code>{item.codigo}</code>
            <span>{item.descricao}</span>
            {/* O planejado da receita é a base do percentual: mostrá-lo aqui
                evita sair da tela para descobrir sobre quanto ele incide. */}
            {item.valor != null ? (
              <em className={item.valor ? "" : "is-zerado"}>{formatarMoeda(item.valor)}</em>
            ) : null}
          </button>
        );
      })}

      {!itens.length ? <p className="sem-contas">{vazio}</p> : null}
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
  escopo,
  podeLancar = true,
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

  // Receita escolhida que não recebe realizado nenhum. Sem explicar, a coluna
  // zerada ao lado de um planejado cheio parece cálculo errado — e não é: o ERP
  // não marca a receita no lançamento.
  const receitaSemRealizado =
    percentual &&
    filtros.receita !== TODAS_AS_CONTAS &&
    !totalDaTabela?.realizado &&
    !totalDaTabela?.anterior;

  const receitas = percentual ? (receitasDisponiveis ?? []) : [];

  // Editar só faz sentido em uma célula única: uma filial e uma conta — e, no
  // módulo percentual, também uma receita: o mesmo percentual vale valores
  // diferentes conforme a receita sobre a qual incide.
  const podeEditar =
    podeLancar &&
    filtros.filial !== "total" &&
    filtros.conta !== TODAS_AS_CONTAS &&
    contasDisponiveis.length > 0 &&
    (!usaCentro || filtros.centro !== SEM_CENTRO) &&
    (!percentual || (filtros.receita !== TODAS_AS_CONTAS && receitas.length > 0));

  const motivo = !podeLancar && filtros.filial !== "total"
    ? "Você tem acesso de leitura nesta combinação — os valores aparecem, mas não podem ser alterados."
    : !contasDisponiveis.length
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
              : `${percentual ? "Digite o percentual ou o valor em reais — as duas colunas aceitam" : "Digite na coluna Planejado"} — Enter grava e desce · arraste o canto da célula (ou Ctrl+Enter) para repetir nos outros meses · Ctrl+D copia o mês de cima · Esc cancela.`;

  // As dimensões que compõem a célula, na ordem em que se escolhe: onde (centro),
  // sobre o quê (receita) e o quê (conta do módulo).
  const paineis = [];

  if (usaCentro) {
    paineis.push({
      titulo: "Centro de custo",
      descricao: "Este módulo é orçado por centro; escolha um para lançar.",
      rotuloTotal: "Total — todos os centros",
      valorTotal: SEM_CENTRO,
      itens: centros.map((centro) => ({ codigo: centro.id, descricao: centro.nome })),
      selecionado: filtros.centro,
      aoSelecionar: (codigo) => onAlterarFiltro({ centro: codigo }),
      vazio: "Nenhum centro de custo ativo no ERP.",
    });
  }

  if (percentual) {
    paineis.push({
      titulo: "Receita (base do %)",
      descricao: `Planejado de ${plano.ano} — é sobre este valor que o percentual incide.`,
      rotuloTotal: "Todas as receitas",
      valorTotal: TODAS_AS_CONTAS,
      itens: receitas.map((codigo) => ({
        codigo,
        descricao: buscarConta(catalogo, codigo)?.descricao ?? "conta fora da visão contábil",
        valor: totaisDasReceitas?.get(codigo) ?? 0,
      })),
      selecionado: filtros.receita,
      aoSelecionar: (codigo) => onAlterarFiltro({ receita: codigo }),
      vazio: "Nenhuma receita configurada para esta filial na visão.",
    });
  }

  paineis.push({
    titulo: "Contas do módulo",
    rotuloTotal: "Total do módulo",
    valorTotal: TODAS_AS_CONTAS,
    itens: contasDisponiveis.map((codigo) => ({
      codigo,
      descricao: buscarConta(catalogo, codigo)?.descricao ?? "conta fora da visão contábil",
    })),
    selecionado: filtros.conta,
    aoSelecionar: (codigo) => onAlterarFiltro({ conta: codigo }),
    vazio: `Nenhuma conta para esta filial${usaCentro ? " e centro" : ""}.`,
  });

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
          <Seletor
            valor={filtros.filial}
            opcoes={[
              {
                valor: "total",
                rotulo: `Total — ${filiais.length} ${filiais.length === 1 ? "filial em uso" : "filiais em uso"}`,
              },
              ...filiais.map((filial) => ({ valor: filial.id, rotulo: filial.nome })),
            ]}
            aoEscolher={(valor) => onAlterarFiltro({ filial: valor })}
            buscaVazia="Nenhuma filial com esse nome."
          />
        </label>

        {/* O ano é o do plano — não há o que escolher, então o campo ocupa só o
            que precisa em vez da largura de um select. */}
        <label className="filtro-ano">
          <span>Ano</span>
          <output className="campo-fixo">
            {plano.ano}
            <span className={`chip chip--${grupo?.chip ?? "receita"}`}>{modulo.grupo}</span>
          </output>
        </label>

        {/* O recorte de quem está vendo, quando não é tudo. */}
        {escopo ? (
          <label>
            <span>Seu acesso</span>
            <output className="campo-fixo">{escopo}</output>
          </label>
        ) : null}

        {/* A dica fecha a linha dos filtros: é sobre o que falta escolher neles. */}
        <DicaEdicao pronta={podeEditar}>{motivo}</DicaEdicao>
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

      {/* Os avisos ficam ACIMA do layout de duas colunas, não dentro da coluna
          da direita: dentro dela empurravam a tabela para baixo e o cabeçalho
          não nascia na mesma linha que os painéis. */}
      {semBase ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          <span>
            Este módulo é lançado em percentual sobre a receita de vendas planejada, e não há receita
            planejada para {filtros.filial === "total" ? "estas filiais" : "esta filial"} em{" "}
            {plano.ano}. Enquanto isso, a coluna em reais fica zerada. Lance Receita de vendas
            primeiro.
          </span>
        </p>
      ) : null}

      {receitaSemRealizado ? (
        <p className="modulo-aviso">
          <Icone nome="info" tamanho={16} />
          <span>
            Sem realizado nesta receita. O ERP não marca a receita no lançamento — a atribuição vem
            do centro de custo, como no Scoreplan: <strong>020</strong> é e-commerce e todo o resto é
            coleção. As demais receitas ficam sem realizado até o ERP passar a identificá-las.
          </span>
        </p>
      ) : null}

      <div className="orcamento-layout" data-paineis={paineis.length}>
        {/* Painéis lado a lado, como no Scoreplan: as dimensões que compõem a
            célula ficam visíveis de uma vez, sem rolar de uma para a outra. Só
            contas analíticas — as sintéticas não recebem lançamento. */}
        <aside className="orcamento-lateral">
          {paineis.map((painel) => (
            <PainelSelecao key={painel.titulo} {...painel} />
          ))}
        </aside>

        <section className="orcamento-dados">
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
