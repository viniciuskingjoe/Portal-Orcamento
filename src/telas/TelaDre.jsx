import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { formatarMoeda, formatarPercentual } from "../lib/formato.js";

function classeVariacao(valor) {
  if (valor > 0) return "positivo";
  if (valor < 0) return "negativo";
  return "";
}

function ComSinal({ valor, formatar = formatarMoeda }) {
  return (
    <>
      {valor > 0 ? "+" : ""}
      {formatar(valor)}
    </>
  );
}

// Uma linha do DRE. Módulo abre a tela do módulo; subtotal é só leitura.
function LinhaDre({ linha, onAbrirModulo }) {
  const ehSubtotal = linha.tipo === "subtotal";
  const rotulo = ehSubtotal
    ? linha.titulo
    : // O sinal fica no rótulo porque o valor é sempre positivo — a mesma
      // convenção de qualquer DRE impresso.
      `${linha.sinal < 0 ? "(-) " : "(+) "}${linha.titulo}`;

  const classe = [
    "linha-dre",
    ehSubtotal ? "linha-dre--subtotal" : "",
    linha.destaque ? "linha-dre--destaque" : "",
    !ehSubtotal && !linha.configurado ? "linha-dre--vazia" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr className={classe}>
      <th scope="row">
        {ehSubtotal ? (
          rotulo
        ) : (
          <button
            type="button"
            className="link-modulo"
            onClick={() => onAbrirModulo(linha.moduloId)}
            disabled={!linha.configurado}
            title={linha.configurado ? "Abrir módulo" : "Módulo sem contas nesta visão"}
          >
            {rotulo}
          </button>
        )}
      </th>

      <td>{formatarMoeda(linha.planejado)}</td>
      <td className="celula-derivada">{formatarPercentual(linha.participacaoPlanejado)}</td>
      <td>{formatarMoeda(linha.realizado)}</td>
      <td className="celula-derivada">{formatarPercentual(linha.participacaoRealizado)}</td>
      <td>{formatarMoeda(linha.anterior)}</td>
      <td className={classeVariacao(linha.variacao)}>
        <ComSinal valor={linha.variacao} />
      </td>
      <td className={classeVariacao(linha.variacaoPercentual)}>
        <ComSinal valor={linha.variacaoPercentual} formatar={formatarPercentual} />
      </td>
    </tr>
  );
}

export default function TelaDre({
  plano,
  visao,
  dre,
  filiais,
  filtroFilial,
  onAlterarFiltroFilial,
  filiaisIgnoradas,
  carregandoRealizado,
  onAbrirModulo,
  onVoltar,
}) {
  if (!visao) {
    return (
      <main className="conteudo">
        <Cabecalho titulo="DRE" subtitulo={`${plano.nome} · ${plano.ano}`} onVoltar={onVoltar} />
        <p className="modulo-aviso">
          <Icone nome="info" tamanho={16} />
          Este plano não tem visão associada — não há o que consolidar.
        </p>
      </main>
    );
  }

  return (
    <main className="conteudo">
      <Cabecalho
        titulo="DRE"
        subtitulo={`${plano.nome} · ${plano.ano} · visão ${visao.nome}`}
        onVoltar={onVoltar}
      />

      <div className="filtros-orcamento">
        <label>
          <span>Filial</span>
          <select
            value={filtroFilial}
            onChange={(evento) => onAlterarFiltroFilial(evento.target.value)}
          >
            <option value="total">
              Total — {filiais.length} {filiais.length === 1 ? "filial em uso" : "filiais em uso"}
            </option>
            {filiais.map((filial) => (
              <option value={filial.id} key={filial.id}>
                {filial.nome}
              </option>
            ))}
          </select>
        </label>

        {/* O ano é o do plano — não há o que escolher, então o campo ocupa só o
            que precisa em vez da largura de um select. */}
        <label className="filtro-ano">
          <span>Ano</span>
          <output className="campo-fixo">{plano.ano}</output>
        </label>
      </div>

      {carregandoRealizado ? <Carregando texto="Carregando realizado do ERP…" /> : null}

      {/* Mesmo aviso das telas de módulo: sem ele o resultado sai menor que o do
          ERP e nada na tela explica por quê. */}
      {filiaisIgnoradas?.length ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          <span>
            {filiaisIgnoradas.length}{" "}
            {filiaisIgnoradas.length === 1
              ? "filial tem movimento em " + plano.ano + " ou em " + (plano.ano - 1) + " e está fora"
              : "filiais têm movimento em " + plano.ano + " ou em " + (plano.ano - 1) + " e estão fora"}{" "}
            das filiais em uso, então não entram neste resultado:{" "}
            <strong>{filiaisIgnoradas.map((f) => f.nome ?? f.id).join(", ")}</strong>. Ajuste em
            Configurações → Filiais.
          </span>
        </p>
      ) : null}

      <div className="tabela-wrap">
        <table className="tabela-orcamento tabela-dre">
          <thead>
            <tr>
              <th scope="col">Resultado do exercício</th>
              <th scope="col">Planejado</th>
              {/* Análise vertical sobre a RECEITA LÍQUIDA, não a bruta: é sobre
                  ela que margem e despesa se medem. */}
              <th scope="col" title="Participação na receita líquida planejada">
                % RL
              </th>
              <th scope="col">Realizado</th>
              <th scope="col" title="Participação na receita líquida realizada">
                % RL
              </th>
              <th scope="col">Ano anterior</th>
              <th scope="col">Variação $</th>
              <th scope="col">Variação %</th>
            </tr>
          </thead>
          <tbody>
            {dre.map((linha) => (
              <LinhaDre key={linha.id} linha={linha} onAbrirModulo={onAbrirModulo} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="dica-edicao">
        <Icone nome="info" tamanho={16} />
        <span>
          Clique em uma linha para orçar o módulo. Cada subtotal é a soma acumulada das linhas acima
          dele, e <strong>% RL</strong> é a participação na receita líquida.
        </span>
      </p>
    </main>
  );
}
