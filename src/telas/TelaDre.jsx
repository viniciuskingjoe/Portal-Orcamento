import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import Seletor from "../componentes/Seletor.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { calcularDre, mesesDoPeriodo } from "../dados/dre.js";
import { sinaisDoModulo } from "../dados/visao.js";
import { formatarMoeda, formatarPercentual } from "../lib/formato.js";

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Uma célula-bloco (Total, ou um mês): Planejado | A.V. Plan | Realizado |
// A.V. Real — quatro colunas que se repetem pra cada coluna de período, do
// jeito que o Scoreplan mostra (Total primeiro, depois mês a mês). Serve
// tanto pro cabeçalho (`cabecalho`, rótulos fixos) quanto pro corpo (valores
// da linha) — mesma estrutura de 4 células.
//
// A coluna Total NÃO fica fixa (sticky) — foi tentado, mas sticky em célula
// de tabela com `table-layout: fixed` quebra o alinhamento das colunas em
// vários navegadores (colunas ficam com largura errada, "vazando"). Só a
// Descrição fica fixa (`.tabela-dre__descricao`, CSS puro, sem essa
// combinação problemática).
function CelulasDoPeriodo({ dado, percentual, cabecalho }) {
  const formatarValor = percentual ? formatarPercentual : formatarMoeda;
  const Celula = cabecalho ? "th" : "td";

  if (cabecalho) {
    return (
      <>
        <Celula scope="col">Planejado</Celula>
        <Celula scope="col" title="Participação na linha-base do planejado">
          % AV
        </Celula>
        <Celula scope="col">Realizado</Celula>
        <Celula scope="col" title="Participação na linha-base do realizado">
          % AV
        </Celula>
      </>
    );
  }

  return (
    <>
      <Celula>{formatarValor(dado.planejado)}</Celula>
      <Celula className="celula-derivada">
        {percentual ? "—" : formatarPercentual(dado.analiseVerticalPlanejado)}
      </Celula>
      <Celula>{formatarValor(dado.realizado)}</Celula>
      <Celula className="celula-derivada">
        {percentual ? "—" : formatarPercentual(dado.analiseVerticalRealizado)}
      </Celula>
    </>
  );
}

// Uma conta do drill-down — mesma estrutura de células da linha-pai, só que
// não abre módulo (clicar na linha-pai já leva lá) e o texto vem indentado,
// com o sinal escolhido ao configurar visível na frente do nome.
function LinhaDetalhe({ item, colunas, percentual }) {
  return (
    <tr className="linha-dre linha-dre--detalhe">
      <th scope="row" className="tabela-dre__descricao">
        <span className="linha-dre__sinal">{item.sinal === -1 ? "−" : "+"}</span>
        <code>{item.codigo}</code> {item.descricao}
      </th>
      {colunas.map((coluna) => (
        <CelulasDoPeriodo
          key={coluna.id}
          dado={coluna.id === "total" ? item.total : item.porMes.find((mes) => mes.id === coluna.mes)}
          percentual={percentual}
        />
      ))}
    </tr>
  );
}

// Uma linha do demonstrativo, mês a mês — módulo abre a tela do módulo (mesmo
// comportamento de antes), fórmula é só leitura. Linha "módulo" com mais de
// uma conta escolhida pode expandir e mostrar o valor de cada uma
// (`linha.detalhe`, calculado em dados/dre.js só quando há o que abrir).
function LinhaDre({ linha, colunas, expandida, onExpandir, onAbrirModulo }) {
  const classe = ["linha-dre", linha.destaca ? "linha-dre--destaque" : ""].filter(Boolean).join(" ");
  // Linha "%": o próprio valor já é um percentual (ex.: dedução / receita
  // líquida), então a análise vertical (% sobre a base) não faz sentido aqui
  // — % de %. `CelulasDoPeriodo` já mostra "—" nessas colunas.
  const percentual = linha.unidade === "percentual";
  const podeExpandir = !!linha.detalhe;

  return (
    <>
      <tr className={classe}>
        <th scope="row" className="tabela-dre__descricao">
          <span className="linha-dre__titulo">
            {podeExpandir ? (
              <button
                type="button"
                className={`botao-icone linha-dre__expandir ${expandida ? "is-aberto" : ""}`}
                onClick={() => onExpandir(linha.id)}
                aria-expanded={expandida}
                aria-label={expandida ? "Recolher contas" : "Expandir contas"}
                title={expandida ? "Recolher contas" : `Mostrar as ${linha.detalhe.length} contas desta linha`}
              >
                <Icone nome="chevron" tamanho={13} />
              </button>
            ) : null}
            {linha.origem === "modulo" ? (
              <button type="button" className="link-modulo" onClick={() => onAbrirModulo(linha.moduloId)}>
                {linha.titulo}
              </button>
            ) : (
              linha.titulo
            )}
          </span>
        </th>

        {colunas.map((coluna) => (
          <CelulasDoPeriodo
            key={coluna.id}
            dado={coluna.id === "total" ? linha.total : linha.meses.find((mes) => mes.id === coluna.mes)}
            percentual={percentual}
          />
        ))}
      </tr>

      {expandida && podeExpandir
        ? linha.detalhe.map((item) => (
            <LinhaDetalhe key={item.codigo} item={item} colunas={colunas} percentual={percentual} />
          ))
        : null}
    </>
  );
}

function BlocoDre({ titulo, linhas, colunas, expandidas, onExpandir, onAbrirModulo }) {
  return (
    <div className="bloco-dre">
      {titulo ? <h3 className="bloco-dre__titulo">{titulo}</h3> : null}
      <div className="tabela-wrap">
        <table className="tabela-orcamento tabela-dre tabela-dre--leitura">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="tabela-dre__descricao">
                Resultado do exercício
              </th>
              {colunas.map((coluna) => (
                <th scope="colgroup" colSpan={4} key={coluna.id} className={coluna.id === "total" ? "tabela-dre__total" : ""}>
                  {coluna.label}
                </th>
              ))}
            </tr>
            <tr>
              {colunas.map((coluna) => (
                <CelulasDoPeriodo key={coluna.id} cabecalho />
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <LinhaDre
                key={linha.id}
                linha={linha}
                colunas={colunas}
                expandida={expandidas.has(linha.id)}
                onExpandir={onExpandir}
                onAbrirModulo={onAbrirModulo}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TelaDre({
  plano,
  visao,
  filiais,
  grupos,
  catalogo,
  realizado,
  carregandoContas,
  onAbrirModulo,
  onVoltar,
}) {
  const [filiaisEscolhidas, setFiliaisEscolhidas] = useState([]);
  const [grupoId, setGrupoId] = useState("");
  const [mesInicio, setMesInicio] = useState(1);
  const [mesFim, setMesFim] = useState(12);
  const [expandidas, setExpandidas] = useState(() => new Set());

  function alternarExpandida(linhaId) {
    setExpandidas((atuais) => {
      const proximo = new Set(atuais);
      if (proximo.has(linhaId)) proximo.delete(linhaId);
      else proximo.add(linhaId);
      return proximo;
    });
  }

  const meses = useMemo(() => mesesDoPeriodo(mesInicio, mesFim), [mesInicio, mesFim]);

  // Total primeiro, depois um bloco de 4 colunas por mês — mesma ordem do
  // Scoreplan. O rótulo do mês é o mesmo `label` que `calcularDre` já gera
  // ("MM/AAAA"), calculado aqui só pra existir antes da primeira linha.
  const colunas = useMemo(
    () => [
      { id: "total", label: "Total" },
      ...meses.map((mes) => ({
        id: `mes-${mes}`,
        mes,
        label: `${String(mes).padStart(2, "0")}/${plano.ano}`,
      })),
    ],
    [meses, plano.ano]
  );

  const grupo = grupos.find((item) => item.id === grupoId) ?? null;
  const centrosPermitidos = grupo ? new Set(grupo.centros) : null;

  // Fórmula entre linhas referencia sinal por módulo (a mesma conta não muda
  // de módulo entre linhas), então o sinal de todos os módulos usados pode
  // ser mesclado num mapa só sem colidir.
  const sinais = useMemo(() => {
    const mapa = {};
    (visao?.dreLinhas ?? []).forEach((linha) => {
      if (linha.origem === "modulo" && linha.moduloId) {
        Object.assign(mapa, sinaisDoModulo(visao, linha.moduloId));
      }
    });
    return mapa;
  }, [visao]);

  // Sem filial escolhida = "Total", que soma todas as filiais em uso num
  // bloco só. Com uma ou mais escolhidas, um bloco por filial, lado a lado —
  // é a comparação do jeito que o Scoreplan mostra.
  const blocos = useMemo(() => {
    const grupos =
      filiaisEscolhidas.length === 0
        ? [{ titulo: null, filiaisDoBloco: filiais }]
        : filiaisEscolhidas
            .map((id) => filiais.find((filial) => filial.id === id))
            .filter(Boolean)
            .map((filial) => ({ titulo: filial.nome, filiaisDoBloco: [filial] }));

    return grupos.map(({ titulo, filiaisDoBloco }) => ({
      titulo,
      linhas: calcularDre({
        visao,
        plano,
        filiais: filiaisDoBloco,
        meses,
        centrosPermitidos,
        catalogo,
        sinais,
        realizado: realizado.doAno,
        realizadoAnterior: realizado.doAnoAnterior,
      }).filter((linha) => linha.mostra),
    }));
  }, [filiaisEscolhidas, filiais, visao, plano, meses, centrosPermitidos, catalogo, sinais, realizado]);

  const semLinhas = !(visao?.dreLinhas?.length > 0);

  return (
    <main className="conteudo conteudo--dre">
      <Cabecalho
        titulo="DRE"
        subtitulo={`${plano.nome} · ${plano.ano}${visao ? ` · visão ${visao.nome}` : ""}`}
        onVoltar={onVoltar}
        acao={
          <div className="filtros-orcamento filtros-dre">
            <label>
              <span>Filial</span>
              <Seletor
                multiplo
                rotuloTodos="Total — todas as filiais"
                valor={filiaisEscolhidas}
                opcoes={filiais.map((filial) => ({ valor: filial.id, rotulo: filial.nome }))}
                aoEscolher={setFiliaisEscolhidas}
                buscaVazia="Nenhuma filial com esse nome."
              />
            </label>

            <label>
              <span>Grupo de centro de custo</span>
              <Seletor
                valor={grupoId}
                opcoes={[
                  { valor: "", rotulo: "Todos os centros" },
                  ...grupos.map((item) => ({ valor: item.id, rotulo: item.nome })),
                ]}
                aoEscolher={setGrupoId}
                buscaVazia="Nenhum grupo com esse nome."
              />
            </label>

            <label className="filtro-periodo">
              <span>De</span>
              <select value={mesInicio} onChange={(evento) => setMesInicio(Number(evento.target.value))}>
                {NOMES_MES.map((nome, indice) => (
                  <option key={nome} value={indice + 1}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="filtro-periodo">
              <span>Até</span>
              <select value={mesFim} onChange={(evento) => setMesFim(Number(evento.target.value))}>
                {NOMES_MES.map((nome, indice) => (
                  <option key={nome} value={indice + 1}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      {realizado.carregando || carregandoContas ? <Carregando texto="Carregando realizado do ERP…" /> : null}

      {semLinhas ? (
        <p className="modulo-aviso">
          <Icone nome="info" tamanho={16} />
          Este DRE ainda não tem nenhuma linha configurada. Configure em Visão → Demonstrativo.
        </p>
      ) : (
        <div className="blocos-dre">
          {blocos.map((bloco, indice) => (
            <BlocoDre
              key={bloco.titulo ?? indice}
              titulo={bloco.titulo}
              linhas={bloco.linhas}
              colunas={colunas}
              expandidas={expandidas}
              onExpandir={alternarExpandida}
              onAbrirModulo={onAbrirModulo}
            />
          ))}
        </div>
      )}

      <p className="dica-edicao">
        <Icone nome="info" tamanho={16} />
        <span>
          Clique numa linha de módulo para abrir o orçamento dela. Linha com a seta ▸ mostra o
          valor de cada conta escolhida ao expandir. <strong>% AV</strong> é a participação na
          linha marcada como base de análise vertical.
        </span>
      </p>
    </main>
  );
}
