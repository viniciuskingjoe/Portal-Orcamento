import { useEffect, useMemo, useRef, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import {
  ancestrais,
  desmarcarEmCascata,
  estadoDaSelecao,
  filtrarPorGrupo,
  linhasDaArvore,
  marcarEmCascata,
  resumirSelecao,
} from "../dados/contas.js";
import { GRUPOS } from "../dados/modulos.js";
import {
  SEM_CENTRO,
  centrosDaFilial,
  contasDaFilial,
  contasDoCentro,
  usaCentroDeCusto,
} from "../dados/visao.js";

function useIndeterminado(parcial) {
  const referencia = useRef(null);
  // `indeterminate` não existe como atributo HTML, só como propriedade.
  useEffect(() => {
    if (referencia.current) referencia.current.indeterminate = parcial;
  }, [parcial]);
  return referencia;
}

function Linha({ item, estado, marcadosAbaixo, onAlternar, onAlternarNo }) {
  const referencia = useIndeterminado(estado === "parcial");

  const classes = [
    "arvore-conta",
    item.sintetica ? "is-grupo" : "is-folha",
    item.nivel === 0 ? "is-raiz" : "",
    estado === "total" ? "is-marcada" : "",
    estado === "parcial" ? "is-parcial" : "",
    item.selecionavel === false ? "is-estrutura" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={{ "--recuo": `${item.nivel * 20}px` }}>
      {item.temFilhos ? (
        <button
          type="button"
          className="arvore-toggle"
          onClick={() => onAlternarNo(item.codigo)}
          aria-expanded={item.aberto}
          aria-label={`${item.aberto ? "Recolher" : "Expandir"} ${item.codigo}`}
        >
          <span className={`arvore-chevron ${item.aberto ? "is-aberto" : ""}`}>
            <Icone nome="chevron" tamanho={13} />
          </span>
        </button>
      ) : (
        <span className="arvore-toggle arvore-toggle--vazio" aria-hidden="true" />
      )}

      {item.selecionavel === false ? (
        <span className="arvore-conta__rotulo arvore-conta__rotulo--estrutura">
          <span className="arvore-conta__vazio" aria-hidden="true" />
          <code>{item.codigo}</code>
          <span>{item.descricao}</span>
        </span>
      ) : (
        <label className="arvore-conta__rotulo">
          <input
            ref={referencia}
            type="checkbox"
            checked={estado === "total"}
            onChange={() => onAlternar(item.codigo, estado)}
          />
          <span className="checkbox-visual">
            <Icone nome={estado === "parcial" ? "minus" : "check"} tamanho={13} />
          </span>
          <code>{item.codigo}</code>
          <span>{item.descricao}</span>
        </label>
      )}

      {!item.aberto && estado === "parcial" && marcadosAbaixo > 0 ? (
        <span className="arvore-conta__abaixo">{marcadosAbaixo}</span>
      ) : null}
    </div>
  );
}

export default function TelaVisaoModulo({
  visao,
  modulo,
  catalogo: catalogoCompleto,
  filiais,
  centros,
  carregando,
  erro,
  onRecarregar,
  onDefinirContasDaFilial,
  onDefinirContasDoCentro,
  onAlternarUsaCentro,
  onVoltar,
}) {
  const usaCentro = usaCentroDeCusto(visao, modulo.id);

  const [filialId, setFilialId] = useState(() => filiais[0]?.id ?? null);
  const [centroId, setCentroId] = useState(SEM_CENTRO);
  const [busca, setBusca] = useState("");

  // Filial que sumiu do ERP não pode continuar selecionada.
  useEffect(() => {
    if (!filiais.some((filial) => filial.id === filialId)) setFilialId(filiais[0]?.id ?? null);
  }, [filiais, filialId]);

  useEffect(() => {
    if (!usaCentro) setCentroId(SEM_CENTRO);
  }, [usaCentro]);

  const daFilial = filialId ? contasDaFilial(visao, modulo.id, filialId) : [];
  const editandoCentro = usaCentro && centroId !== SEM_CENTRO;

  // Sem centro escolhido a árvore é o plano de contas do grupo. Com centro, é só
  // o que a filial orça — o centro é subconjunto dela.
  const catalogo = useMemo(() => {
    const doGrupo = filtrarPorGrupo(catalogoCompleto, modulo.grupo);
    if (!editandoCentro) return doGrupo;

    const permitidas = new Set(daFilial);
    const lista = doGrupo.lista.filter(
      (item) => permitidas.has(item.codigo) || item.selecionavel === false
    );
    return filtrarPorGrupo({ ...doGrupo, lista, porCodigo: new Map(lista.map((i) => [i.codigo, i])) }, null);
  }, [catalogoCompleto, modulo.grupo, editandoCentro, daFilial]);

  const selecionadas = editandoCentro
    ? contasDoCentro(visao, modulo.id, filialId, centroId)
    : daFilial;
  const marcadas = useMemo(() => new Set(selecionadas), [selecionadas]);
  const resumo = useMemo(() => resumirSelecao(catalogo, marcadas), [catalogo, marcadas]);

  const [expandidos, setExpandidos] = useState(() => new Set(catalogo.raizes));
  useEffect(() => {
    setExpandidos((atuais) => {
      const abertos = new Set([...atuais, ...catalogo.raizes]);
      selecionadas.forEach((codigo) =>
        ancestrais(catalogo, codigo).forEach((pai) => abertos.add(pai))
      );
      return abertos;
    });
    // Só quando a árvore em si muda (filial/centro/visão contábil).
  }, [catalogo]); // eslint-disable-line react-hooks/exhaustive-deps

  const termo = busca.trim().toLowerCase();
  const linhas = useMemo(() => {
    if (!termo) return linhasDaArvore(catalogo, expandidos);
    return catalogo.lista
      .filter(
        (item) =>
          item.codigo.toLowerCase().includes(termo) ||
          item.descricao.toLowerCase().includes(termo)
      )
      .map((item) => ({ ...item, nivel: 0, temFilhos: false, aberto: true }));
  }, [catalogo, expandidos, termo]);

  const salvar = (proximas) => {
    if (editandoCentro) onDefinirContasDoCentro(modulo.id, filialId, centroId, [...proximas]);
    else onDefinirContasDaFilial(modulo.id, filialId, [...proximas]);
  };

  const alternar = (codigo, estado) =>
    salvar(
      estado === "vazio"
        ? marcarEmCascata(catalogo, marcadas, codigo)
        : desmarcarEmCascata(catalogo, marcadas, codigo)
    );

  const alternarNo = (codigo) =>
    setExpandidos((atuais) => {
      const proximo = new Set(atuais);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });

  const grupo = GRUPOS[modulo.grupo];
  const centrosComContas = filialId ? centrosDaFilial(visao, modulo.id, filialId) : [];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`Visão ${visao.nome} · contas por filial${usaCentro ? " e centro de custo" : ""}`}
        onVoltar={onVoltar}
      />

      <div className="modulo-barra">
        <span className={`chip chip--${grupo?.chip ?? "receita"}`}>
          {grupo?.rotulo ?? modulo.tipo} · {modulo.grupo}
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
          onClick={() => setExpandidos(new Set(catalogo.lista.map((i) => i.codigo)))}
          disabled={!!termo || !catalogo.lista.length}
        >
          Expandir tudo
        </button>
        <button
          type="button"
          className="botao botao--secundario botao--compacto"
          onClick={() => setExpandidos(new Set(catalogo.raizes))}
          disabled={!!termo || !catalogo.lista.length}
        >
          Recolher
        </button>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={usaCentro}
            onChange={(e) => onAlternarUsaCentro(modulo.id, e.target.checked)}
          />
          <span className="checkbox-visual">
            <Icone nome="check" tamanho={13} />
          </span>
          Usa centro de custo
        </label>
      </div>

      {carregando ? <Carregando texto="Carregando plano de contas…" /> : null}
      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={onRecarregar} /> : null}

      {!carregando && !erro ? (
        <div className="orcamento-layout">
          {/* Filial e centro viram painéis à esquerda, como na tela do plano:
              a escolha fica sempre visível junto do que ela filtra. */}
          <aside className="orcamento-lateral">
            <section className="painel-selecao">
              <h3>Filiais</h3>
              {filiais.length ? (
                filiais.map((filial) => {
                  const quantas = contasDaFilial(visao, modulo.id, filial.id).length;
                  return (
                    <button
                      type="button"
                      key={filial.id}
                      className={`selecao-item ${filial.id === filialId ? "is-active" : ""}`}
                      aria-pressed={filial.id === filialId}
                      onClick={() => setFilialId(filial.id)}
                    >
                      <span>{filial.nome}</span>
                      {quantas ? <b>{quantas}</b> : null}
                    </button>
                  );
                })
              ) : (
                <p className="sem-contas">
                  Nenhuma filial ativa. Escolha em Configurações → Filiais.
                </p>
              )}
            </section>

            {usaCentro ? (
              <section className="painel-selecao">
                <h3>Centros de custo</h3>
                <button
                  type="button"
                  className={`selecao-item ${centroId === SEM_CENTRO ? "is-active" : ""}`}
                  aria-pressed={centroId === SEM_CENTRO}
                  onClick={() => setCentroId(SEM_CENTRO)}
                >
                  <span>Contas da filial</span>
                  {daFilial.length ? <b>{daFilial.length}</b> : null}
                </button>
                {centros.map((centro) => {
                  const quantas = filialId
                    ? contasDoCentro(visao, modulo.id, filialId, centro.id).length
                    : 0;
                  return (
                    <button
                      type="button"
                      key={centro.id}
                      className={`selecao-item selecao-item--conta ${
                        centro.id === centroId ? "is-active" : ""
                      }`}
                      aria-pressed={centro.id === centroId}
                      onClick={() => setCentroId(centro.id)}
                      disabled={!daFilial.length}
                      title={daFilial.length ? undefined : "Escolha primeiro as contas da filial"}
                    >
                      <code>{centro.id}</code>
                      <span>
                        {centro.nome}
                        {quantas ? ` · ${quantas}` : ""}
                      </span>
                    </button>
                  );
                })}
              </section>
            ) : null}
          </aside>

          <section className="orcamento-dados">
            {filialId ? (
              <div className="contas-seletor">
                <div className="contas-seletor__topo">
                  <span>
                    {editandoCentro ? `Contas do centro ${centroId}` : "Contas da filial"}
                    <small className="contas-seletor__origem">
                      {editandoCentro
                        ? `escolhidas entre as ${daFilial.length} da filial`
                        : `plano de contas do grupo ${modulo.grupo}`}
                    </small>
                  </span>
                  <span className="contas-seletor__acoes">
                    <small>
                      {selecionadas.length}{" "}
                      {selecionadas.length === 1 ? "selecionada" : "selecionadas"}
                    </small>
                    <button
                      type="button"
                      className="botao-texto"
                      onClick={() => salvar(new Set())}
                      disabled={!selecionadas.length}
                    >
                      Limpar
                    </button>
                  </span>
                </div>

                <div className="contas-seletor__lista contas-seletor__lista--alta">
                  {linhas.length ? (
                    linhas.map((item) => (
                      <Linha
                        key={item.codigo}
                        item={item}
                        estado={estadoDaSelecao(resumo, item.codigo)}
                        marcadosAbaixo={
                          item.temFilhos
                            ? (resumo.get(item.codigo)?.marcados ?? 0) -
                              (marcadas.has(item.codigo) ? 1 : 0)
                            : 0
                        }
                        onAlternar={alternar}
                        onAlternarNo={alternarNo}
                      />
                    ))
                  ) : (
                    <p className="sem-contas">
                      {editandoCentro && !daFilial.length
                        ? "Escolha primeiro as contas da filial: o centro seleciona entre elas."
                        : "Nenhuma conta corresponde ao filtro."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="modulo-aviso">
                <Icone nome="info" tamanho={16} />
                Escolha uma filial na lateral para configurar as contas dela.
              </p>
            )}

            {usaCentro && centrosComContas.length ? (
              <p className="modulo-aviso">
                <Icone nome="info" tamanho={16} />
                Centros com contas nesta filial: {centrosComContas.join(", ")}.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
