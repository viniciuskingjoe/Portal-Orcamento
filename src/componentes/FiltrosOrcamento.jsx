import Icone from "./Icone.jsx";

// Só aparece quando falta alguma coisa para poder lançar. Sem motivo, sem
// faixa: a tela pronta não precisa se anunciar.
export function DicaEdicao({ children }) {
  if (!children) return null;

  return (
    <div className="dica-edicao">
      <Icone nome="info" tamanho={18} />
      <span>{children}</span>
    </div>
  );
}
