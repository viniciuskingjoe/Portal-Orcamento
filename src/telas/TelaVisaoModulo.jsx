import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { contasDoModulo } from "../dados/visao.js";

// Contas sintéticas não recebem lançamento; o movimento fica nas folhas. Marcar
// um pai vale pelos descendentes (ver expandirComDescendentes), e a tela avisa.
export default function TelaVisaoModulo({ visao, modulo, catalogo, onAlterarContas, onVoltar }) {
  const [busca, setBusca] = useState("");

  const selecionadas = contasDoModulo(visao, modulo.id);
  const marcadas = useMemo(() => new Set(selecionadas), [selecionadas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return catalogo.lista;
    return catalogo.lista.filter(
      (conta) =>
        conta.codigo.toLowerCase().includes(termo) ||
        conta.descricao.toLowerCase().includes(termo)
    );
  }, [catalogo.lista, busca]);

  const alternar = (codigo) =>
    onAlterarContas(
      marcadas.has(codigo)
        ? selecionadas.filter((item) => item !== codigo)
        : [...selecionadas, codigo]
    );

  const todasMarcadas = visiveis.length > 0 && visiveis.every((conta) => marcadas.has(conta.codigo));

  const alternarVisiveis = () => {
    const codigos = visiveis.map((conta) => conta.codigo);
    if (todasMarcadas) {
      const fora = new Set(codigos);
      onAlterarContas(selecionadas.filter((item) => !fora.has(item)));
    } else {
      onAlterarContas([...new Set([...selecionadas, ...codigos])]);
    }
  };

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`Visão ${visao.nome} · selecione as contas que compõem este módulo`}
        onVoltar={onVoltar}
      />

      <div className="modulo-barra">
        <span className={`chip chip--${modulo.tipo}`}>
          {modulo.tipo === "receita" ? "Receita" : "Despesa"}
        </span>
        <label className="campo-busca">
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Filtrar por código ou descrição…"
            aria-label="Filtrar contas"
          />
        </label>
        <button
          type="button"
          className="botao botao--secundario botao--compacto"
          onClick={alternarVisiveis}
          disabled={!visiveis.length}
        >
          {todasMarcadas ? "Desmarcar exibidas" : "Marcar exibidas"}
        </button>
      </div>

      <div className="contas-seletor">
        <div className="contas-seletor__topo">
          <span>Contas disponíveis</span>
          <small>
            {selecionadas.length} {selecionadas.length === 1 ? "selecionada" : "selecionadas"}
          </small>
        </div>
        <div className="contas-seletor__lista contas-seletor__lista--alta">
          {visiveis.length ? (
            visiveis.map((conta) => (
              <label
                className={`conta-checkbox conta-checkbox--nivel-${Math.min(conta.nivel, 5)} ${
                  conta.sintetica ? "is-sintetica" : ""
                }`}
                key={conta.codigo}
              >
                <input
                  type="checkbox"
                  checked={marcadas.has(conta.codigo)}
                  onChange={() => alternar(conta.codigo)}
                />
                <span className="checkbox-visual">
                  <Icone nome="check" tamanho={13} />
                </span>
                <code>{conta.codigo}</code>
                <span>{conta.descricao}</span>
              </label>
            ))
          ) : (
            <p className="sem-contas">
              {catalogo.lista.length
                ? "Nenhuma conta corresponde ao filtro."
                : "O ERP não devolveu contas para esta visão contábil."}
            </p>
          )}
        </div>
      </div>

      <p className="modulo-aviso">
        <Icone nome="info" tamanho={16} />
        As alterações são salvas na hora. Marcar uma conta sintética (em negrito) vale também pelas
        contas abaixo dela — não é preciso marcar as folhas uma a uma.
      </p>
    </main>
  );
}
