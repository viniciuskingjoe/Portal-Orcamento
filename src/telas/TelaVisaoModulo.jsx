import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import { ancestrais, linhasDaArvore } from "../dados/contas.js";
import { contasDoModulo } from "../dados/visao.js";

function Linha({ item, marcado, onAlternarSelecao, onAlternarNo }) {
  return (
    <div
      className={`arvore-conta ${item.sintetica ? "is-grupo" : ""} ${marcado ? "is-marcada" : ""}`}
      style={{ paddingLeft: `${14 + item.nivel * 22}px` }}
    >
      {item.temFilhos ? (
        <button
          type="button"
          className="arvore-toggle"
          onClick={() => onAlternarNo(item.codigo)}
          aria-expanded={item.aberto}
          aria-label={`${item.aberto ? "Recolher" : "Expandir"} ${item.codigo}`}
        >
          <span className={`arvore-chevron ${item.aberto ? "is-aberto" : ""}`}>
            <Icone nome="chevron" tamanho={14} />
          </span>
        </button>
      ) : (
        <span className="arvore-toggle arvore-toggle--vazio" aria-hidden="true" />
      )}

      {/* O chevron fica FORA do label: dentro dele, expandir também marcaria a conta. */}
      <label className="arvore-conta__rotulo">
        <input type="checkbox" checked={marcado} onChange={() => onAlternarSelecao(item.codigo)} />
        <span className="checkbox-visual">
          <Icone nome="check" tamanho={13} />
        </span>
        <code>{item.codigo}</code>
        <span>{item.descricao}</span>
      </label>
    </div>
  );
}

export default function TelaVisaoModulo({
  visao,
  modulo,
  catalogo,
  carregando,
  erro,
  onRecarregar,
  onAlterarContas,
  onVoltar,
}) {
  const selecionadas = contasDoModulo(visao, modulo.id);
  const marcadas = useMemo(() => new Set(selecionadas), [selecionadas]);

  // Abre as raízes e o caminho até tudo que já está marcado — sem isso uma conta
  // selecionada no fundo da árvore ficaria escondida.
  const [expandidos, setExpandidos] = useState(() => {
    const abertos = new Set(catalogo.raizes);
    selecionadas.forEach((codigo) =>
      ancestrais(catalogo, codigo).forEach((pai) => abertos.add(pai))
    );
    return abertos;
  });

  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();

  // Com filtro ativo a lista vira plana: exigir que o usuário abra os nós até
  // achar o resultado anularia o filtro.
  const linhas = useMemo(() => {
    if (!termo) return linhasDaArvore(catalogo, expandidos);
    return catalogo.lista
      .filter(
        (item) =>
          item.codigo.toLowerCase().includes(termo) ||
          item.descricao.toLowerCase().includes(termo)
      )
      .map((item) => ({ ...item, nivel: 0, temFilhos: false, aberto: false }));
  }, [catalogo, expandidos, termo]);

  const alternarNo = (codigo) =>
    setExpandidos((atuais) => {
      const proximo = new Set(atuais);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });

  const alternarSelecao = (codigo) =>
    onAlterarContas(
      marcadas.has(codigo)
        ? selecionadas.filter((item) => item !== codigo)
        : [...selecionadas, codigo]
    );

  const expandirTudo = () =>
    setExpandidos(new Set(catalogo.lista.map((item) => item.codigo)));
  const recolherTudo = () => setExpandidos(new Set(catalogo.raizes));

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
          onClick={expandirTudo}
          disabled={!!termo || !catalogo.lista.length}
        >
          Expandir tudo
        </button>
        <button
          type="button"
          className="botao botao--secundario botao--compacto"
          onClick={recolherTudo}
          disabled={!!termo || !catalogo.lista.length}
        >
          Recolher
        </button>
      </div>

      {carregando ? <Carregando texto="Carregando plano de contas…" /> : null}
      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={onRecarregar} /> : null}

      {!carregando && !erro ? (
        <div className="contas-seletor">
          <div className="contas-seletor__topo">
            <span>{termo ? "Resultados do filtro" : "Plano de contas"}</span>
            <small>
              {selecionadas.length} {selecionadas.length === 1 ? "selecionada" : "selecionadas"}
            </small>
          </div>
          <div className="contas-seletor__lista contas-seletor__lista--alta">
            {linhas.length ? (
              linhas.map((item) => (
                <Linha
                  key={item.codigo}
                  item={item}
                  marcado={marcadas.has(item.codigo)}
                  onAlternarSelecao={alternarSelecao}
                  onAlternarNo={alternarNo}
                />
              ))
            ) : (
              <p className="sem-contas">
                {catalogo.lista.length
                  ? "Nenhuma conta corresponde ao filtro."
                  : "O ERP não devolveu classificações para esta visão contábil."}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <p className="modulo-aviso">
        <Icone nome="info" tamanho={16} />
        Salvo na hora. Marcar um grupo (em negrito) vale também pelas contas abaixo dele — não é
        preciso marcar as folhas uma a uma.
      </p>
    </main>
  );
}
