import Icone from "./Icone.jsx";

export function DicaEdicao({ pronta, children }) {
  return (
    <div className={`dica-edicao ${pronta ? "is-ready" : ""}`}>
      <Icone nome={pronta ? "check" : "info"} tamanho={18} />
      <span>{children}</span>
    </div>
  );
}
