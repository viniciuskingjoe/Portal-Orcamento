import Icone from "./Icone.jsx";
import { anosDoPlano } from "../dados/plano.js";

export function FiltrosOrcamento({ plano, filiais, filtros, onAlterarFiltro }) {
  return (
    <div className="filtros-orcamento">
      <label>
        <span>Filial</span>
        <select
          value={filtros.filial}
          onChange={(evento) => onAlterarFiltro({ filial: evento.target.value })}
        >
          <option value="total">Total — todas as filiais</option>
          {filiais.map((filial) => (
            <option value={filial.id} key={filial.id}>
              {filial.nome}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Período</span>
        <select
          value={filtros.ano}
          onChange={(evento) => onAlterarFiltro({ ano: Number(evento.target.value) })}
        >
          {anosDoPlano(plano).map((ano) => (
            <option value={ano} key={ano}>
              Janeiro/{ano} a Dezembro/{ano}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function DicaEdicao({ pronta, children }) {
  return (
    <div className={`dica-edicao ${pronta ? "is-ready" : ""}`}>
      <Icone nome="info" tamanho={18} />
      <span>{children}</span>
    </div>
  );
}
