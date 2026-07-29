import { formatarMoeda, formatarPercentual } from "../lib/formato.js";

const LINHAS_RESUMO = new Set(["total", "media"]);

function classeVariacao(valor) {
  if (valor > 0) return "positivo";
  if (valor < 0) return "negativo";
  return "";
}

export default function TabelaOrcamento({
  linhas,
  formato = "moeda",
  podeEditar,
  editingCell,
  onIniciarEdicao,
  onAlterarEdicao,
  onConfirmarEdicao,
  onCancelarEdicao,
  prefixoCelula,
}) {
  const ehPercentual = formato === "percentual";
  const formatar = ehPercentual ? formatarPercentual : formatarMoeda;

  return (
    <div className="tabela-wrap">
      <table className="tabela-orcamento">
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Planejado</th>
            <th scope="col">Realizado</th>
            <th scope="col">Ano anterior</th>
            <th scope="col">Variação {ehPercentual ? "p.p." : "$"}</th>
            <th scope="col">Variação %</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const ehResumo = LINHAS_RESUMO.has(linha.id);
            const celulaId = `${prefixoCelula}|${linha.id}`;
            const emEdicao = editingCell?.id === celulaId;
            const editavel = podeEditar && !ehResumo;

            return (
              <tr key={linha.id} className={ehResumo ? `linha-${linha.id}` : ""}>
                <th scope="row" title={linha.nota}>
                  {linha.label}
                  {linha.nota ? <abbr title={linha.nota}>*</abbr> : null}
                </th>
                <td
                  className={editavel ? "celula-editavel" : ""}
                  onClick={editavel && !emEdicao ? () => onIniciarEdicao(celulaId, linha.planejado, linha.id) : undefined}
                  title={editavel ? "Clique para editar" : undefined}
                >
                  {emEdicao ? (
                    <input
                      className="input-inline"
                      value={editingCell.valor}
                      onChange={(evento) => onAlterarEdicao(evento.target.value)}
                      onBlur={onConfirmarEdicao}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter") evento.currentTarget.blur();
                        if (evento.key === "Escape") onCancelarEdicao();
                      }}
                      autoFocus
                      inputMode="decimal"
                      aria-label={`Editar planejado de ${linha.label}`}
                    />
                  ) : (
                    formatar(linha.planejado)
                  )}
                </td>
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
