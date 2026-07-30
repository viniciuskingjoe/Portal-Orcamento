import { useRef, useState } from "react";

import { formatarMoeda, formatarPercentual } from "../lib/formato.js";

const LINHAS_RESUMO = new Set(["total", "media"]);

// Teclas que começam a edição digitando direto na célula, como no Excel. Sem
// isto seria preciso clicar antes de cada número.
const ABRE_EDICAO = /^[0-9,.]$/;

function classeVariacao(valor) {
  if (valor > 0) return "positivo";
  if (valor < 0) return "negativo";
  return "";
}

export default function TabelaOrcamento({
  linhas,
  formato = "moeda",
  // Módulo em que se digita percentual: a coluna editável passa a ser o %, e o
  // valor em reais aparece ao lado, calculado.
  percentual = false,
  podeEditar,
  editingCell,
  onIniciarEdicao,
  onAlterarEdicao,
  onConfirmarEdicao,
  onCancelarEdicao,
  onCopiarDeCima,
  onPreencherAte,
  prefixoCelula,
}) {
  const ehPercentual = formato === "percentual";
  const formatar = ehPercentual ? formatarPercentual : formatarMoeda;

  // Só os meses recebem digitação; total e média são calculados. A ordem desta
  // lista é a ordem da navegação por Enter, Tab e setas.
  const editaveis = linhas.filter((linha) => !LINHAS_RESUMO.has(linha.id));
  const idDaCelula = (linha) => `${prefixoCelula}|${linha.id}`;
  const digitado = (linha) => (percentual ? (linha.planejadoPercentual ?? 0) : linha.planejado);

  // --------------------------------------------------------------------------
  // Alça de preenchimento (o quadradinho do canto, como no Excel)
  //
  // `arrasto` guarda índices da lista de meses, não números de mês: é o que a
  // marcação visual usa, e evita converter ida e volta a cada movimento.
  // --------------------------------------------------------------------------
  const [arrasto, setArrasto] = useState(null);
  const celulas = useRef([]);

  // Índice da linha sob o ponteiro. Fora da tabela, gruda no primeiro ou no
  // último mês — arrastar além de dezembro deve preencher até dezembro, não
  // cancelar o gesto.
  function indiceNoPonto(clientY) {
    const linhasVisiveis = celulas.current.filter(Boolean);
    if (!linhasVisiveis.length) return null;

    let encontrado = null;
    celulas.current.forEach((elemento, indice) => {
      if (!elemento) return;
      const area = elemento.getBoundingClientRect();
      if (clientY >= area.top && clientY <= area.bottom) encontrado = indice;
    });
    if (encontrado != null) return encontrado;

    const primeira = linhasVisiveis[0].getBoundingClientRect();
    return clientY < primeira.top ? 0 : celulas.current.length - 1;
  }

  function comecarArrasto(evento, indice) {
    evento.preventDefault();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    setArrasto({ origem: indice, ate: indice });
  }

  function moverArrasto(evento) {
    if (!arrasto) return;
    const indice = indiceNoPonto(evento.clientY);
    if (indice != null && indice !== arrasto.ate) setArrasto({ ...arrasto, ate: indice });
  }

  function soltarArrasto() {
    if (!arrasto) return;
    if (arrasto.ate !== arrasto.origem) {
      onPreencherAte?.(editaveis[arrasto.origem].id, editaveis[arrasto.ate].id);
    }
    setArrasto(null);
  }

  const noArrasto = (indice) =>
    arrasto != null &&
    indice >= Math.min(arrasto.origem, arrasto.ate) &&
    indice <= Math.max(arrasto.origem, arrasto.ate);

  function irPara(indice, texto) {
    const alvo = editaveis[indice];
    if (!alvo) return;
    onIniciarEdicao(idDaCelula(alvo), texto ?? digitado(alvo), alvo.id);
  }

  // Teclado dentro do input. Enter e Tab gravam e descem — digitar doze meses
  // sem tirar a mão do teclado é o caso normal, não a exceção.
  function teclasNaEdicao(evento, indice) {
    const comando = evento.ctrlKey || evento.metaKey;

    if (evento.key === "Escape") {
      onCancelarEdicao();
      return;
    }
    // Ctrl+Enter repete o valor digitado deste mês até dezembro.
    if (evento.key === "Enter" && comando) {
      evento.preventDefault();
      onConfirmarEdicao({ replicar: true });
      return;
    }
    if (evento.key === "Enter" || evento.key === "Tab") {
      evento.preventDefault();
      onConfirmarEdicao();
      irPara(evento.shiftKey ? indice - 1 : indice + 1);
      return;
    }
    if (evento.key === "ArrowUp" || evento.key === "ArrowDown") {
      evento.preventDefault();
      onConfirmarEdicao();
      irPara(evento.key === "ArrowUp" ? indice - 1 : indice + 1);
    }
  }

  // Teclado na célula fechada: Enter abre, Ctrl+D copia o mês de cima, e
  // qualquer dígito já abre a edição com ele dentro.
  function teclasNaCelula(evento, linha, indice) {
    const comando = evento.ctrlKey || evento.metaKey;

    if (comando && (evento.key === "d" || evento.key === "D")) {
      evento.preventDefault();
      onCopiarDeCima?.(linha.id);
      return;
    }
    if (evento.key === "Enter" || evento.key === "F2") {
      evento.preventDefault();
      irPara(indice);
      return;
    }
    if (!comando && !evento.altKey && ABRE_EDICAO.test(evento.key)) {
      evento.preventDefault();
      irPara(indice, evento.key === "." ? "," : evento.key);
    }
  }

  return (
    <div className={`tabela-wrap ${arrasto ? "is-arrastando" : ""}`}>
      <table className="tabela-orcamento">
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {percentual ? <th scope="col">Planejado %</th> : null}
            <th scope="col">Planejado{percentual ? " R$" : ""}</th>
            <th scope="col">Realizado</th>
            <th scope="col">Ano anterior</th>
            <th scope="col">Variação {ehPercentual ? "p.p." : "$"}</th>
            <th scope="col">Variação %</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const ehResumo = LINHAS_RESUMO.has(linha.id);
            const indice = editaveis.indexOf(linha);
            const celulaId = idDaCelula(linha);
            const emEdicao = editingCell?.id === celulaId;
            const editavel = podeEditar && !ehResumo;

            const celulaDigitavel = (
              <td
                ref={(elemento) => {
                  if (indice >= 0) celulas.current[indice] = elemento;
                }}
                className={[
                  editavel ? "celula-editavel" : "",
                  noArrasto(indice) ? "is-preenchendo" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                tabIndex={editavel && !emEdicao ? 0 : undefined}
                onClick={editavel && !emEdicao ? () => irPara(indice) : undefined}
                onKeyDown={
                  editavel && !emEdicao
                    ? (evento) => teclasNaCelula(evento, linha, indice)
                    : undefined
                }
                title={editavel ? "Clique ou tecle Enter para editar" : undefined}
              >
                {/* A alça só existe fora da edição: durante a digitação o canto
                    da célula é do input. */}
                {editavel && !emEdicao ? (
                  <button
                    type="button"
                    className="alca-preenchimento"
                    aria-label={`Arrastar ${linha.label} para os outros meses`}
                    title="Arraste para repetir este valor nos outros meses"
                    onPointerDown={(evento) => comecarArrasto(evento, indice)}
                    onPointerMove={moverArrasto}
                    onPointerUp={soltarArrasto}
                    onPointerCancel={() => setArrasto(null)}
                    // Sem isto, soltar a alça sobre a própria célula abriria a
                    // edição logo depois do arrasto.
                    onClick={(evento) => evento.stopPropagation()}
                  />
                ) : null}
                {emEdicao ? (
                  <input
                    className="input-inline"
                    value={editingCell.valor}
                    onChange={(evento) => onAlterarEdicao(evento.target.value)}
                    // O id vai junto: quando a navegação já trocou de célula, o
                    // blur da anterior chega atrasado e não pode gravar de novo.
                    onBlur={() => onConfirmarEdicao({ id: celulaId })}
                    onKeyDown={(evento) => teclasNaEdicao(evento, indice)}
                    onFocus={(evento) => evento.currentTarget.select()}
                    autoFocus
                    inputMode="decimal"
                    aria-label={`Editar planejado de ${linha.label}`}
                  />
                ) : percentual ? (
                  formatarPercentual(linha.planejadoPercentual ?? 0)
                ) : (
                  formatar(linha.planejado)
                )}
              </td>
            );

            return (
              <tr key={linha.id} className={ehResumo ? `linha-${linha.id}` : ""}>
                <th scope="row" title={linha.nota}>
                  {linha.label}
                  {linha.nota ? <abbr title={linha.nota}>*</abbr> : null}
                </th>

                {percentual ? (
                  ehResumo ? (
                    <td>
                      {linha.planejadoPercentual == null
                        ? "—"
                        : formatarPercentual(linha.planejadoPercentual)}
                    </td>
                  ) : (
                    celulaDigitavel
                  )
                ) : null}

                {/* Em módulo percentual esta coluna é calculada: % × receita
                    planejada do mês. É o número que fecha com o DRE. */}
                {percentual ? (
                  <td className="celula-calculada">{formatarMoeda(linha.planejado)}</td>
                ) : (
                  celulaDigitavel
                )}

                <td>{formatar(linha.realizado)}</td>
                <td>{formatar(linha.anterior)}</td>
                <td className={classeVariacao(linha.variacao)}>
                  {linha.variacao > 0 ? "+" : ""}
                  {formatar(linha.variacao)}
                </td>
                <td className={classeVariacao(linha.variacaoPercentual)}>
                  {linha.variacaoPercentual > 0 ? "+" : ""}
                  {formatarPercentual(linha.variacaoPercentual)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
