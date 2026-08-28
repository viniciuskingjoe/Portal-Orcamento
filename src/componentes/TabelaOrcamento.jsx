import { useEffect, useRef, useState } from "react";

import CelulaQuantidade, { limparQuantidade } from "./CelulaQuantidade.jsx";
import { formatarMoeda, formatarPercentual } from "../lib/formato.js";

const LINHAS_RESUMO = new Set(["total", "media"]);

// Teclas que começam a edição digitando direto na célula, como no Excel. Sem
// isto seria preciso clicar antes de cada número.
const ABRE_EDICAO = /^[0-9,.]$/;

// Verde/vermelho tem que significar "bom/ruim", não "subiu/desceu": receita
// que cresce é notícia boa (verde), mas despesa que cresce é notícia ruim
// (vermelho) — a mesma variação positiva é favorável num tipo de módulo e
// desfavorável no outro. Sem isto, os 7 módulos de despesa do sistema
// pintavam gasto crescente de verde.
function classeVariacao(valor, tipoModulo) {
  if (!valor) return "";
  const favoravel = tipoModulo === "despesa" ? valor < 0 : valor > 0;
  return favoravel ? "positivo" : "negativo";
}

export default function TabelaOrcamento({
  linhas,
  formato = "moeda",
  // Módulo em que se digita percentual: a tabela ganha a coluna do % ao lado da
  // coluna em reais, e as DUAS aceitam digitação — o % é o que fica gravado, e
  // digitar em reais é o mesmo lançamento pelo outro lado.
  percentual = false,
  // "receita" ou "despesa" — decide se uma variação positiva é notícia boa
  // (verde) ou ruim (vermelho). Default "receita" preserva o sentido antigo
  // onde não for passado.
  tipoModulo = "receita",
  podeEditar,
  editingCell,
  // Ids (formato de `idDaCelula`) cuja última gravação falhou — fica marcada
  // até a pessoa editar de novo, pra escrita otimista não deixar um número
  // errado na tela sem aviso nenhum.
  celulasFalhas,
  onIniciarEdicao,
  onAlterarEdicao,
  onConfirmarEdicao,
  onCancelarEdicao,
  onCopiarDeCima,
  onPreencherAte,
  prefixoCelula,
  // Só Despesas com pessoal: { obterValor(mes), podeEditar, onGravar([{mes,
  // quantidade}]) }. Liga a coluna Nº de funcionários — informativa, ao lado
  // do Planejado, sem entrar no cálculo dele: o valor digitado em Planejado
  // já é o total do centro (quem digita já considera quantas pessoas são).
  colunaFuncionarios,
  // Avisa o pai (até virar `edicaoAuxiliarEmAndamento` em App.jsx) que a
  // célula de Nº de funcionários está em edição ou em arrasto — mesmo motivo
  // do `editingCell` para Planejado, mas essa edição é local a este
  // componente e o App não a enxergaria sozinho.
  onFuncionariosEmEdicao,
}) {
  const ehPercentual = formato === "percentual";
  const formatar = ehPercentual ? formatarPercentual : formatarMoeda;
  const comFuncionarios = !!colunaFuncionarios;

  // Só os meses recebem digitação; total e média são calculados. A ordem desta
  // lista é a ordem da navegação por Enter, Tab e setas.
  const editaveis = linhas.filter((linha) => !LINHAS_RESUMO.has(linha.id));
  const idDaCelula = (linha, campo) => `${prefixoCelula}|${linha.id}|${campo}`;
  const valorDoCampo = (linha, campo) =>
    campo === "reais" ? linha.planejado : (linha.planejadoPercentual ?? 0);

  // --------------------------------------------------------------------------
  // Nº de funcionários (coluna própria — edição simples de clique/teclado,
  // mais a alça de arrastar, igual ao Planejado; sem Ctrl+D nem navegação por
  // seta, que são atalhos do fluxo de digitar doze meses de reais em série)
  // --------------------------------------------------------------------------
  const [funcEditando, setFuncEditando] = useState(null);
  const [funcRascunho, setFuncRascunho] = useState("");
  const [arrastoFunc, setArrastoFunc] = useState(null);
  const celulasFunc = useRef([]);

  useEffect(() => {
    onFuncionariosEmEdicao?.(funcEditando != null || arrastoFunc != null);
    // Se a tela sair do ar com a célula aberta (trocou de conta, de tela),
    // a flag não pode ficar travada em "true" para sempre — sem isto a
    // atualização de fundo do app inteiro parava.
    return () => onFuncionariosEmEdicao?.(false);
  }, [funcEditando, arrastoFunc, onFuncionariosEmEdicao]);

  function confirmarFuncionario() {
    if (funcEditando == null) return;
    const mes = funcEditando;
    const atual = colunaFuncionarios.obterValor(mes);
    const texto = funcRascunho.trim();
    const novo = texto === "" ? null : Number(texto);

    setFuncEditando(null);
    setFuncRascunho("");
    if (novo === atual) return;
    colunaFuncionarios.onGravar([{ mes, quantidade: novo }]);
  }

  function indiceNoPontoFunc(clientY) {
    const visiveis = celulasFunc.current.filter(Boolean);
    if (!visiveis.length) return null;

    let encontrado = null;
    celulasFunc.current.forEach((elemento, indice) => {
      if (!elemento) return;
      const area = elemento.getBoundingClientRect();
      if (clientY >= area.top && clientY <= area.bottom) encontrado = indice;
    });
    if (encontrado != null) return encontrado;

    const primeira = visiveis[0].getBoundingClientRect();
    return clientY < primeira.top ? 0 : celulasFunc.current.length - 1;
  }

  function comecarArrastoFunc(evento, indice) {
    evento.preventDefault();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    setArrastoFunc({ origem: indice, ate: indice });
  }

  function moverArrastoFunc(evento) {
    if (!arrastoFunc) return;
    const indice = indiceNoPontoFunc(evento.clientY);
    if (indice != null && indice !== arrastoFunc.ate) setArrastoFunc({ ...arrastoFunc, ate: indice });
  }

  function soltarArrastoFunc() {
    if (!arrastoFunc) return;
    if (arrastoFunc.ate !== arrastoFunc.origem) {
      const origemMes = editaveis[arrastoFunc.origem].id;
      const finalMes = editaveis[arrastoFunc.ate].id;
      const valor = colunaFuncionarios.obterValor(origemMes);
      const [de, ate] = origemMes <= finalMes ? [origemMes, finalMes] : [finalMes, origemMes];

      const celulas = [];
      for (let mes = de; mes <= ate; mes += 1) {
        if (mes !== origemMes) celulas.push({ mes, quantidade: valor });
      }
      if (celulas.length) colunaFuncionarios.onGravar(celulas);
    }
    setArrastoFunc(null);
  }

  const noArrastoFunc = (indice) =>
    arrastoFunc != null &&
    indice >= Math.min(arrastoFunc.origem, arrastoFunc.ate) &&
    indice <= Math.max(arrastoFunc.origem, arrastoFunc.ate);

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
    const falhou = celulasFalhas?.has(celulaId);
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
          falhou && !emEdicao ? "celula-editavel--falhou" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={editavel && !emEdicao ? 0 : undefined}
        role={editavel && !emEdicao ? "button" : undefined}
        aria-invalid={falhou && !emEdicao ? true : undefined}
        onClick={editavel && !emEdicao ? () => irPara(indice, campo) : undefined}
        onKeyDown={
          editavel && !emEdicao
            ? (evento) => teclasNaCelula(evento, linha, indice, campo)
            : undefined
        }
        title={
          falhou && !emEdicao
            ? "Não foi salvo — clique ou tecle Enter para editar e tentar de novo"
            : editavel
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
            // Em módulo percentual há duas células editáveis por linha (%
            // e R$) — sem o campo no rótulo, as duas anunciavam a mesma
            // coisa e quem usa leitor de tela não sabia qual tinha foco.
            aria-label={`Editar ${campo === "percentual" ? "percentual" : "planejado"} de ${linha.label}`}
          />
        ) : (
          formatarValor(valorDoCampo(linha, campo))
        )}
      </td>
    );
  }

  return (
    <div className={`tabela-wrap ${arrasto || arrastoFunc ? "is-arrastando" : ""}`}>
      <table className="tabela-orcamento">
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {comFuncionarios ? <th scope="col">Nº funcionários</th> : null}
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
            const indiceFunc = indice;

            return (
              <tr key={linha.id} className={ehResumo ? `linha-${linha.id}` : ""}>
                <th scope="row" title={linha.nota}>
                  {linha.label}
                  {linha.nota ? <abbr title={linha.nota}>*</abbr> : null}
                </th>

                {comFuncionarios ? (
                  ehResumo ? (
                    <td />
                  ) : (
                    <CelulaQuantidade
                      valor={colunaFuncionarios.obterValor(linha.id)}
                      podeEditar={colunaFuncionarios.podeEditar}
                      editando={funcEditando === linha.id}
                      rascunho={funcRascunho}
                      tdRef={(elemento) => {
                        if (indiceFunc >= 0) celulasFunc.current[indiceFunc] = elemento;
                      }}
                      emArrasto={noArrastoFunc(indiceFunc)}
                      onIniciar={(inicial) => {
                        setFuncEditando(linha.id);
                        setFuncRascunho(limparQuantidade(inicial));
                      }}
                      onMudar={setFuncRascunho}
                      onConfirmar={confirmarFuncionario}
                      onCancelar={() => {
                        setFuncEditando(null);
                        setFuncRascunho("");
                      }}
                      onComecarArrasto={
                        colunaFuncionarios.podeEditar && funcEditando !== linha.id
                          ? (evento) => comecarArrastoFunc(evento, indiceFunc)
                          : undefined
                      }
                      onMoverArrasto={moverArrastoFunc}
                      onSoltarArrasto={soltarArrastoFunc}
                      onCancelarArrasto={() => setArrastoFunc(null)}
                    />
                  )
                ) : null}

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
                <td className={classeVariacao(linha.variacao, tipoModulo)}>
                  {linha.variacao > 0 ? "+" : ""}
                  {formatar(linha.variacao)}
                </td>
                <td className={classeVariacao(linha.variacaoPercentual, tipoModulo)}>
                  {linha.variacaoPercentual > 0 ? "+" : ""}
                  {formatarPercentual(linha.variacaoPercentual)}
                </td>
                <td className={linha.vsOrcado == null ? "" : classeVariacao(linha.vsOrcado, tipoModulo)}>
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
