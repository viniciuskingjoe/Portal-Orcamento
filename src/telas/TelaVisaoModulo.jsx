import { useEffect, useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import LinhaConta from "../componentes/LinhaConta.jsx";
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
import { tipoDaConta } from "../dados/realizado.js";
import {
  SEM_CENTRO,
  centroEmUso,
  centrosDaFilial,
  sinaisDoModulo,
  contasDaFilial,
  contasDoCentro,
} from "../dados/visao.js";

export default function TelaVisaoModulo({
  visao,
  modulo,
  catalogo: catalogoCompleto,
  filiais,
  centros,
  carregando,
  erro,
  onRecarregar,
  onDefinirContasDoCentro,
  onDefinirUsoDoCentro,
  onDefinirSinal,
  onVoltar,
}) {
  const [filialId, setFilialId] = useState(() => filiais[0]?.id ?? null);
  const [centroId, setCentroId] = useState(SEM_CENTRO);
  const [busca, setBusca] = useState("");

  // Filial que sumiu do ERP não pode continuar selecionada.
  useEffect(() => {
    if (!filiais.some((filial) => filial.id === filialId)) setFilialId(filiais[0]?.id ?? null);
  }, [filiais, filialId]);

  // Centro escolhido que a filial atual não usa não pode continuar em edição —
  // acontece ao trocar de filial com um centro selecionado.
  useEffect(() => {
    if (centroId === SEM_CENTRO || !filialId) return;
    if (!centroEmUso(visao, modulo.id, filialId, centroId)) setCentroId(SEM_CENTRO);
  }, [centroId, filialId, visao, modulo.id]);

  const daFilial = filialId ? contasDaFilial(visao, modulo.id, filialId) : [];
  const editandoCentro = centroId !== SEM_CENTRO;
  // Marcar conta só faz sentido dentro de um centro: a lista da filial é o
  // consolidado deles, não uma escolha.
  const podeMarcar = !!filialId && editandoCentro;

  const catalogo = useMemo(
    () => filtrarPorGrupo(catalogoCompleto, modulo.grupo),
    [catalogoCompleto, modulo.grupo]
  );

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

  // Só há um destino: o centro escolhido. `podeMarcar` já garante que existe um.
  const salvar = (proximas) =>
    onDefinirContasDoCentro(modulo.id, filialId, centroId, [...proximas]);

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

  const sinais = useMemo(() => sinaisDoModulo(visao, modulo.id), [visao, modulo.id]);
  const contexto = { sinais, visaoContabil: visao.visaoContabil };

  const sinalDaConta = (item) => {
    if (item.sintetica !== false || !marcadas.has(item.codigo)) return null;
    const tipo = tipoDaConta(catalogo, item.codigo, modulo.tipo, contexto);
    // Automático seria o mesmo cálculo sem o que o usuário definiu à mão.
    const automatico = tipoDaConta(catalogo, item.codigo, modulo.tipo, {
      visaoContabil: visao.visaoContabil,
    });
    return {
      tipo,
      grupo: item.grupo ?? modulo.grupo,
      manual: !!sinais[item.codigo] && sinais[item.codigo] !== automatico,
      automatico,
    };
  };

  const grupo = GRUPOS[modulo.grupo];
  const centrosComContas = filialId ? centrosDaFilial(visao, modulo.id, filialId) : [];

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`Visão ${visao.nome} · contas por filial e centro de custo`}
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
      </div>

      {carregando ? <Carregando texto="Carregando plano de contas…" /> : null}
      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={onRecarregar} /> : null}

      {!carregando && !erro ? (
        <div className="orcamento-layout" data-paineis={2}>
          {/* Filial e centro viram painéis à esquerda, como na tela do plano: a
              escolha fica sempre visível junto do que ela filtra.

              `data-paineis` é o que dá largura à coluna: sem ele os dois painéis
              dividem os 268px do caso de um só e o nome da filial fica
              ilegível. */}
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

            {/* Todo módulo é orçado por centro, então o painel é parte do fluxo
                e não algo que se liga: filial → centros → contas de cada um. */}
            <section className="painel-selecao">
              <h3>Centros de custo</h3>
                <p className="painel-selecao__descricao">
                  {filialId
                    ? "Marque os que esta filial usa; clique no nome para escolher as contas dele."
                    : "Escolha uma filial na lista ao lado."}
                </p>

                {centros.map((centro) => {
                  const quantas = filialId
                    ? contasDoCentro(visao, modulo.id, filialId, centro.id).length
                    : 0;
                  const emUso = filialId ? centroEmUso(visao, modulo.id, filialId, centro.id) : false;

                  return (
                    <div
                      key={centro.id}
                      className={[
                        "selecao-item selecao-item--centro",
                        centro.id === centroId ? "is-active" : "",
                        !filialId ? "is-bloqueado" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {/* A caixa diz se a filial usa o centro. Ligado nasce
                          vazio: escolher as contas é o passo seguinte, e é o
                          que a árvore à direita faz. */}
                      <label
                        className="centro-uso"
                        title={
                          emUso
                            ? "Deixar de usar este centro nesta filial (perde as contas dele)"
                            : "Usar este centro nesta filial"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={emUso}
                          disabled={!filialId}
                          onChange={() => {
                            onDefinirUsoDoCentro(modulo.id, filialId, centro.id, !emUso);
                            setCentroId(emUso ? SEM_CENTRO : centro.id);
                          }}
                        />
                        <span className="checkbox-visual">
                          <Icone nome="check" tamanho={13} />
                        </span>
                      </label>

                      <button
                        type="button"
                        className="centro-nome"
                        aria-pressed={centro.id === centroId}
                        onClick={() => setCentroId(centro.id)}
                        disabled={!emUso}
                        title={emUso ? centro.nome : "Marque o centro para escolher as contas dele"}
                      >
                        <code>{centro.id}</code>
                        <span>{centro.nome}</span>
                      </button>

                      {quantas ? <b>{quantas}</b> : null}
                    </div>
                  );
                })}
            </section>
          </aside>

          <section className="orcamento-dados">
            {podeMarcar ? (
              <div className="contas-seletor">
                <div className="contas-seletor__topo">
                  <span>
                    {editandoCentro ? `Contas do centro ${centroId}` : "Contas da filial"}
                    <small className="contas-seletor__origem">
                      plano de contas do grupo {modulo.grupo}
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
                      <LinhaConta
                        key={item.codigo}
                        item={item}
                        estado={estadoDaSelecao(resumo, item.codigo)}
                        marcadosAbaixo={
                          item.temFilhos
                            ? (resumo.get(item.codigo)?.marcados ?? 0) -
                              (marcadas.has(item.codigo) ? 1 : 0)
                            : 0
                        }
                        cascateavel={(resumo.get(item.codigo)?.total ?? 0) > 0}
                        sinal={sinalDaConta(item)}
                        onInverter={(codigo, sinal) =>
                          onDefinirSinal(
                            modulo.id,
                            codigo,
                            // Já manual volta ao automático; senão fixa o contrário.
                            sinal.manual ? null : sinal.tipo === "receita" ? "despesa" : "receita"
                          )
                        }
                        onAlternar={alternar}
                        onAlternarNo={alternarNo}
                      />
                    ))
                  ) : (
                    <p className="sem-contas">Nenhuma conta corresponde ao filtro.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="modulo-aviso">
                <Icone nome="info" tamanho={16} />
                {!filialId
                  ? "Escolha uma filial na lateral para configurar as contas dela."
                  : "Este módulo é orçado por centro de custo: marque os centros que esta filial usa e escolha um para lançar as contas dele."}
              </p>
            )}

            {centrosComContas.length ? (
              <p className="modulo-aviso">
                <Icone nome="info" tamanho={16} />
                Centros em uso nesta filial: {centrosComContas.join(", ")} · {daFilial.length}{" "}
                {daFilial.length === 1 ? "conta no total" : "contas no total"}.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
