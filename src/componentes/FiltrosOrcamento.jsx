import Icone from "./Icone.jsx";

// Só aparece quando falta alguma coisa para poder lançar, OU quando há uma
// dica de atalho a dispensar (`onFechar`) — sem nenhum dos dois, a tela
// pronta não precisa se anunciar.
export function DicaEdicao({ children, onFechar }) {
  if (!children) return null;

  return (
    <div className="dica-edicao">
      <Icone nome="info" tamanho={18} />
      <span>{children}</span>
      {onFechar ? (
        <button
          type="button"
          className="dica-edicao__fechar botao-icone"
          onClick={onFechar}
          aria-label="Dispensar dica"
          title="Não mostrar de novo"
        >
          <Icone nome="close" tamanho={13} />
        </button>
      ) : null}
    </div>
  );
}
