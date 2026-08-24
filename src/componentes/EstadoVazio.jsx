import Icone from "./Icone.jsx";

// O ícone orienta ANTES de ler a frase — "carteira" servia pra tudo, do
// primeiro plano vazio a "o ERP não respondeu", que não têm nada a ver
// entre si. Cada tela passa o ícone que já usa em outro lugar pra essa
// mesma coisa (nav da sidebar, aviso de conexão), pra não inventar um
// terceiro símbolo pro mesmo conceito.
export default function EstadoVazio({ texto, icone = "wallet" }) {
  return (
    <div className="estado-vazio">
      <span className="estado-vazio__icone">
        <Icone nome={icone} tamanho={24} />
      </span>
      <strong>Nenhum item por aqui</strong>
      <p>{texto}</p>
    </div>
  );
}
