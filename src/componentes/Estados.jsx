import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";

export function Carregando({ texto = "Carregando dados do ERP…" }) {
  return (
    <p className="estado-carregando" role="status">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </p>
  );
}

export function AvisoErro({ mensagem, onTentarDeNovo }) {
  return (
    <div className="aviso-erro" role="alert">
      <span className="aviso-erro__icone">
        <Icone nome="info" tamanho={20} />
      </span>
      <div>
        <strong>Não foi possível carregar os dados do ERP</strong>
        <p>{mensagem}</p>
      </div>
      {onTentarDeNovo ? (
        <Botao variante="secundario" onClick={onTentarDeNovo}>
          Tentar de novo
        </Botao>
      ) : null}
    </div>
  );
}
