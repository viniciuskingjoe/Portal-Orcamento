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
  prefixoCelula,
}) {
  const ehPercentual = formato === "percentual";
  const formatar = ehPercentual ? formatarPercentual : formatarMoeda;

  // Só os meses recebem digitação; total e média são calculados. A ordem desta
  // lista é a ordem da navegação por Enter, Tab e setas.
  const editaveis = linhas.filter((linha) => !LINHAS_RESUMO.has(linha.id));
  const idDaCelula = (linha) => `${prefixoCelula}|${linha.id}`;
  const digitado = (linha) => (percentual ? (linha.planejadoPercentual ?? 0) : linha.planejado);

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
    <div className="tabela-wrap">
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
                className={editavel ? "celula-editavel" : ""}
                tabIndex={editavel && !emEdicao ? 0 : undefined}
                onClick={editavel && !emEdicao ? () => irPara(indice) : undefined}
                onKeyDown={
                  editavel && !emEdicao
                    ? (evento) => teclasNaCelula(evento, linha, indice)
                    : undefined
                }
                title={editavel ? "Clique ou tecle Enter para editar" : undefined}
              >
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
