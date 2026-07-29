import Icone from "./Icone.jsx";

export default function EstadoVazio({ texto }) {
  return (
    <div className="estado-vazio">
      <span className="estado-vazio__icone">
        <Icone nome="wallet" tamanho={24} />
      </span>
      <strong>Nenhum item por aqui</strong>
      <p>{texto}</p>
    </div>
  );
}
