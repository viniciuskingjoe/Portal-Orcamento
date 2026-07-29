import Icone from "./Icone.jsx";

export default function Cabecalho({ titulo, subtitulo, onVoltar, acao }) {
  return (
    <div className="cabecalho-pagina">
      <div className="cabecalho-pagina__texto">
        {onVoltar ? (
          <button type="button" className="botao-voltar" onClick={onVoltar} aria-label="Voltar">
            <Icone nome="arrowLeft" tamanho={19} />
          </button>
        ) : null}
        <div>
          <h1>{titulo}</h1>
          {subtitulo ? <p>{subtitulo}</p> : null}
        </div>
      </div>
      {acao ?? null}
    </div>
  );
}
