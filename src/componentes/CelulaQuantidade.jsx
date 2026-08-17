// ============================================================================
// CÉLULA DE QUANTIDADE DE FUNCIONÁRIOS
//
// Usada pela coluna "Nº funcionários" de TabelaOrcamento.jsx, no lançamento
// de Despesas com pessoal — edição célula a célula, teclado próprio (só
// dígitos), zero-não-é-vazio.
// ============================================================================

const ABRE_EDICAO = /^[0-9]$/;

// Só dígitos. Quantidade de gente não tem casa decimal nem sinal, e barrar na
// digitação evita explicar depois por que "3,5" virou 3.
export const limparQuantidade = (texto) => String(texto ?? "").replace(/\D/g, "");

export default function CelulaQuantidade({
  valor,
  podeEditar,
  editando,
  rascunho,
  onIniciar,
  onMudar,
  onConfirmar,
  onCancelar,
  // Alça de preenchimento (arrastar o valor para os outros meses, como no
  // Excel) — opcional: só quem tem para onde arrastar (uma linha de doze
  // meses, não a grade inteira de TelaFuncionarios) passa isto.
  tdRef,
  emArrasto = false,
  onComecarArrasto,
  onMoverArrasto,
  onSoltarArrasto,
  onCancelarArrasto,
}) {
  if (editando) {
    return (
      <td className="celula-qtde is-editando" ref={tdRef}>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={rascunho}
          aria-label="Quantidade de funcionários"
          onChange={(evento) => onMudar(limparQuantidade(evento.target.value))}
          onBlur={onConfirmar}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") onConfirmar();
            if (evento.key === "Escape") onCancelar();
          }}
        />
      </td>
    );
  }

  return (
    <td
      ref={tdRef}
      className={[
        "celula-qtde",
        podeEditar ? "is-editavel" : "",
        valor == null ? "is-vazia" : "",
        emArrasto ? "is-preenchendo" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      tabIndex={podeEditar ? 0 : undefined}
      role={podeEditar ? "button" : undefined}
      onClick={podeEditar ? () => onIniciar(String(valor ?? "")) : undefined}
      onKeyDown={
        podeEditar
          ? (evento) => {
              if (evento.key === "Enter") onIniciar(String(valor ?? ""));
              // Digitar direto começa a edição, como no Excel — sem isto seria
              // preciso clicar antes de cada um dos 384 números.
              else if (ABRE_EDICAO.test(evento.key)) onIniciar(evento.key);
              else if (evento.key === "Delete" || evento.key === "Backspace") onIniciar("");
            }
          : undefined
      }
    >
      {valor == null ? "—" : valor}
      {podeEditar && onComecarArrasto ? (
        <button
          type="button"
          className="alca-preenchimento"
          aria-label="Arrastar para os outros meses"
          title="Arraste para repetir este valor nos outros meses"
          onPointerDown={onComecarArrasto}
          onPointerMove={onMoverArrasto}
          onPointerUp={onSoltarArrasto}
          onPointerCancel={onCancelarArrasto}
          // Sem isto, soltar a alça sobre a própria célula abriria a edição
          // logo depois do arrasto.
          onClick={(evento) => evento.stopPropagation()}
        />
      ) : null}
    </td>
  );
}
