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
  // Módulo em que se digita percentual: a tabela ganha a coluna do % ao lado da
  // coluna em reais, e as DUAS aceitam digitação — o % é o que fica gravado, e
  // digitar em reais é o mesmo lançamento pelo outro lado.
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
  const idDaCelula = (linha, campo) => `${prefixoCelula}|${linha.id}|${campo}`;
  const valorDoCampo = (linha, campo) =>
    campo === "reais" ? linha.planejado : (linha.planejadoPercentual ?? 0);

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

  // --------------------------------------------------------------------------
  // Navegação e digitação
  // --------------------------------------------------------------------------

  // A navegação anda na vertical e mantém a coluna: quem está preenchendo os
  // doze meses de um jeito não quer trocar de unidade no meio.
  function irPara(indice, campo, texto) {
    const alvo = editaveis[indice];
    if (!alvo) return;
    onIniciarEdicao(
      idDaCelula(alvo, campo),
      texto ?? valorDoCampo(alvo, campo),
      alvo.id,
      campo === "reais"
    );
  }

  // Teclado dentro do input. Enter e Tab gravam e descem — digitar doze meses
  // sem tirar a mão do teclado é o caso normal, não a exceção.
  function teclasNaEdicao(evento, indice, campo) {
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
      irPara(evento.shiftKey ? indice - 1 : indice + 1, campo);
      return;
    }
    if (evento.key === "ArrowUp" || evento.key === "ArrowDown") {
      evento.preventDefault();
      onConfirmarEdicao();
      irPara(evento.key === "ArrowUp" ? indice - 1 : indice + 1, campo);
    }
  }

  // Teclado na célula fechada: Enter abre, Ctrl+D copia o mês de cima, e
  // qualquer dígito já abre a edição com ele dentro.
  function teclasNaCelula(evento, linha, indice, campo) {
    const comando = evento.ctrlKey || evento.metaKey;

    if (comando && (evento.key === "d" || evento.key === "D")) {
      evento.preventDefault();
      onCopiarDeCima?.(linha.id);
      return;
    }
    if (evento.key === "Enter" || evento.key === "F2") {
      evento.preventDefault();
      irPara(indice, campo);
      return;
    }
    if (!comando && !evento.altKey && ABRE_EDICAO.test(evento.key)) {
      evento.preventDefault();
      irPara(indice, campo, evento.key === "." ? "," : evento.key);
    }
  }

  // `campo` é "percentual" ou "reais". Nos módulos em reais só existe o segundo,
  // e é ele que guarda o valor direto.
  function celulaDigitavel(linha, indice, campo, comAlca) {
    const celulaId = idDaCelula(linha, campo);
    const emEdicao = editingCell?.id === celulaId;
    const editavel = podeEditar && indice >= 0;
    const formatarValor = campo === "reais" ? formatarMoeda : formatarPercentual;

    return (
      <td
        ref={
          comAlca
            ? (elemento) => {
                if (indice >= 0) celulas.current[indice] = elemento;
              }
            : undefined
        }
        className={[
          editavel ? "celula-editavel" : "",
          noArrasto(indice) ? "is-preenchendo" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={editavel && !emEdicao ? 0 : undefined}
        onClick={editavel && !emEdicao ? () => irPara(indice, campo) : undefined}
        onKeyDown={
          editavel && !emEdicao
            ? (evento) => teclasNaCelula(evento, linha, indice, campo)
            : undefined
        }
        title={
          editavel
            ? campo === "reais" && percentual
              ? "Digite o valor: o percentual é calculado sobre a receita do mês"
              : "Clique ou tecle Enter para editar"
            : undefined
        }
      >
        {/* A alça só existe fora da edição: durante a digitação o canto da
            célula é do input. */}
        {editavel && !emEdicao && comAlca ? (
          <button
            type="button"
            className="alca-preenchimento"
            aria-label={`Arrastar ${linha.label} para os outros meses`}
            title="Arraste para repetir este valor nos outros meses"
            onPointerDown={(evento) => comecarArrasto(evento, indice)}
            onPointerMove={moverArrasto}
            onPointerUp={soltarArrasto}
            onPointerCancel={() => setArrasto(null)}
            // Sem isto, soltar a alça sobre a própria célula abriria a edição
            // logo depois do arrasto.
            onClick={(evento) => evento.stopPropagation()}
          />
        ) : null}

        {emEdicao ? (
          <input
            className="input-inline"
            value={editingCell.valor}
            onChange={(evento) => onAlterarEdicao(evento.target.value)}
            // O id vai junto: quando a navegação já trocou de célula, o blur da
            // anterior chega atrasado e não pode gravar de novo.
            onBlur={() => onConfirmarEdicao({ id: celulaId })}
            onKeyDown={(evento) => teclasNaEdicao(evento, indice, campo)}
            onFocus={(evento) => evento.currentTarget.select()}
            autoFocus
            inputMode="decimal"
            aria-label={`Editar planejado de ${linha.label}`}
          />
        ) : (
          formatarValor(valorDoCampo(linha, campo))
        )}
      </td>
    );
  }

  return (
    <div className={`tabela-wrap ${arrasto ? "is-arrastando" : ""}`}>
      <table className="tabela-orcamento">
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {percentual ? <th scope="col">Planejado %</th> : null}
            <th scope="col">Planejado{percentual ? " R$" : ""}</th>
            {/* Realizado sobre a receita REALIZADA do mês, não sobre a planejada:
                é o que deixa a coluna comparável com Planejado %. */}
            {percentual ? (
              <th scope="col" title="Realizado ÷ receita realizada do mês">
                Realizado %
              </th>
            ) : null}
            <th scope="col">Realizado</th>
            <th scope="col">Ano anterior</th>
            <th scope="col">Variação {ehPercentual ? "p.p." : "$"}</th>
            <th scope="col" title="Realizado contra o ano anterior">Variação %</th>
            {/* Outra pergunta que a Variação %: aquela olha para trás, esta olha
                para o que foi orçado. No Scoreplan as duas dividem a mesma
                coluna, e por isso a linha Total de lá parecia não bater. */}
            <th scope="col" title="Realizado contra o planejado do período">
              Vs. orçado
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const ehResumo = LINHAS_RESUMO.has(linha.id);
            const indice = editaveis.indexOf(linha);

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
                    celulaDigitavel(linha, indice, "percentual", true)
                  )
                ) : null}

                {ehResumo ? (
                  <td>{formatar(linha.planejado)}</td>
                ) : (
                  celulaDigitavel(linha, indice, "reais", !percentual)
                )}

                {percentual ? (
                  <td className="celula-derivada">
                    {linha.realizadoPercentual == null
                      ? "—"
                      : formatarPercentual(linha.realizadoPercentual)}
                  </td>
                ) : null}

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
                <td className={linha.vsOrcado == null ? "" : classeVariacao(linha.vsOrcado)}>
                  {linha.vsOrcado == null ? (
                    "—"
                  ) : (
                    <>
                      {linha.vsOrcado > 0 ? "+" : ""}
                      {formatarPercentual(linha.vsOrcado)}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
