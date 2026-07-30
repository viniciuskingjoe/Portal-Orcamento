import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { contasDoModulo as catalogoDoModulo } from "../dados/contas.js";
import { contasDoModulo } from "../dados/visao.js";

export default function TelaVisaoModulo({ visao, modulo, onAlterarContas, onVoltar }) {
  const [busca, setBusca] = useState("");

  const catalogo = catalogoDoModulo(modulo.id);
  const selecionadas = contasDoModulo(visao, modulo.id);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return catalogo;
    return catalogo.filter(
      (conta) =>
        conta.codigo.toLowerCase().includes(termo) ||
        conta.descricao.toLowerCase().includes(termo)
    );
  }, [catalogo, busca]);

  const alternar = (contaId) =>
    onAlterarContas(
      selecionadas.includes(contaId)
        ? selecionadas.filter((id) => id !== contaId)
        : [...selecionadas, contaId]
    );

  const todasVisiveisMarcadas =
    visiveis.length > 0 && visiveis.every((conta) => selecionadas.includes(conta.id));

  const alternarVisiveis = () => {
    const idsVisiveis = visiveis.map((conta) => conta.id);
    if (todasVisiveisMarcadas) {
      onAlterarContas(selecionadas.filter((id) => !idsVisiveis.includes(id)));
    } else {
      onAlterarContas([...new Set([...selecionadas, ...idsVisiveis])]);
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
        <button type="button" className="botao botao--secundario botao--compacto" onClick={alternarVisiveis} disabled={!visiveis.length}>
          {todasVisiveisMarcadas ? "Desmarcar exibidas" : "Marcar exibidas"}
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
            visiveis.map((conta) => {
              const marcado = selecionadas.includes(conta.id);
              return (
                <label className="conta-checkbox" key={conta.id}>
                  <input type="checkbox" checked={marcado} onChange={() => alternar(conta.id)} />
                  <span className="checkbox-visual">
                    <Icone nome="check" tamanho={13} />
                  </span>
                  <code>{conta.codigo}</code>
                  <span>{conta.descricao}</span>
                </label>
              );
            })
          ) : (
            <p className="sem-contas">Nenhuma conta corresponde ao filtro.</p>
          )}
        </div>
      </div>

      {/* Enquanto o banco não entra, só receita (3.1.1.x) e dedução (3.1.9.x)
          têm contas cadastradas. */}
      <p className="modulo-aviso">
        <Icone nome="info" tamanho={16} />
        As alterações são salvas na hora. O catálogo de contas ainda é provisório — os módulos de
        custo e despesa passarão a ler o plano de contas do ERP.
      </p>
    </main>
  );
}
