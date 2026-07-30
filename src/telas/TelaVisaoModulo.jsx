import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import {
  ancestrais,
  ancestralMarcado,
  contarMarcadosAbaixo,
  expandirComDescendentes,
  filtrarPorGrupo,
  linhasDaArvore,
} from "../dados/contas.js";
import { GRUPOS } from "../dados/modulos.js";
import { contasDoModulo } from "../dados/visao.js";

function Linha({ item, marcado, herdadoDe, marcadosAbaixo, onAlternarSelecao, onAlternarNo }) {
  const incluida = marcado || !!herdadoDe;
  const classes = [
    "arvore-conta",
    item.sintetica ? "is-grupo" : "is-folha",
    item.nivel === 0 ? "is-raiz" : "",
    marcado ? "is-marcada" : "",
    herdadoDe ? "is-herdada" : "",
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

      {/* O chevron fica FORA do rótulo: dentro dele, expandir também marcaria. */}
      {item.selecionavel === false ? (
        <span className="arvore-conta__rotulo arvore-conta__rotulo--estrutura">
          <span className="arvore-conta__vazio" aria-hidden="true" />
          <code>{item.codigo}</code>
          <span>{item.descricao}</span>
        </span>
      ) : (
        <label
          className="arvore-conta__rotulo"
          title={
            herdadoDe
              ? `Já incluída por ${herdadoDe}. Desmarque ${herdadoDe} para escolher conta por conta.`
              : undefined
          }
        >
          {/* Herdada aparece marcada porque ENTRA na soma. Desabilitada porque quem
              manda é o pai: desmarcar aqui não teria efeito nenhum. */}
          <input
            type="checkbox"
            checked={incluida}
            disabled={!!herdadoDe}
            onChange={() => onAlternarSelecao(item.codigo)}
          />
          <span className="checkbox-visual">
            <Icone nome="check" tamanho={13} />
          </span>
          <code>{item.codigo}</code>
          <span>{item.descricao}</span>
        </label>
      )}

      {herdadoDe ? <span className="arvore-conta__herdada">via {herdadoDe}</span> : null}

      {/* Com o nó recolhido, é o único sinal de que há seleção escondida abaixo. */}
      {!incluida && !item.aberto && marcadosAbaixo > 0 ? (
        <span className="arvore-conta__abaixo" title={`${marcadosAbaixo} marcadas abaixo`}>
          {marcadosAbaixo}
        </span>
      ) : null}
    </div>
  );
}

export default function TelaVisaoModulo({
  visao,
  modulo,
  catalogo: catalogoCompleto,
  carregando,
  erro,
  onRecarregar,
  onAlterarContas,
  onVoltar,
}) {
  // Cada módulo só oferece as contas do seu LX_GRUPO_CONTABIL.
  const catalogo = useMemo(
    () => filtrarPorGrupo(catalogoCompleto, modulo.grupo),
    [catalogoCompleto, modulo.grupo]
  );

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
      .map((item) => ({ ...item, nivel: 0, temFilhos: false, aberto: true }));
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

  const expandirTudo = () => setExpandidos(new Set(catalogo.lista.map((item) => item.codigo)));
  const recolherTudo = () => setExpandidos(new Set(catalogo.raizes));

  const grupo = GRUPOS[modulo.grupo];
  const selecionaveis = catalogo.lista.filter((item) => item.selecionavel !== false).length;

  // Quantas contas o módulo soma de fato: as marcadas mais as herdadas. Só o
  // número de marcadas engana — marcar um grupo inclui tudo abaixo dele.
  const noModulo = useMemo(
    () => expandirComDescendentes(catalogo, selecionadas, modulo.grupo).size,
    [catalogo, selecionadas, modulo.grupo]
  );

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`Visão ${visao.nome} · selecione as contas que compõem este módulo`}
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
            <span>
              {termo ? "Resultados do filtro" : "Plano de contas"}
              <small className="contas-seletor__origem">
                {selecionaveis} {selecionaveis === 1 ? "conta" : "contas"} do grupo {modulo.grupo}
              </small>
            </span>
            <small>
              {noModulo} {noModulo === 1 ? "conta no módulo" : "contas no módulo"}
              {selecionadas.length !== noModulo ? (
                <span className="contas-seletor__marcadas">
                  {selecionadas.length} {selecionadas.length === 1 ? "marcada" : "marcadas"} +{" "}
                  {noModulo - selecionadas.length} herdadas
                </span>
              ) : null}
            </small>
          </div>
          <div className="contas-seletor__lista contas-seletor__lista--alta">
            {linhas.length ? (
              linhas.map((item) => (
                <Linha
                  key={item.codigo}
                  item={item}
                  marcado={marcadas.has(item.codigo)}
                  herdadoDe={
                    marcadas.has(item.codigo)
                      ? null
                      : ancestralMarcado(catalogo, item.codigo, marcadas)
                  }
                  marcadosAbaixo={
                    item.temFilhos ? contarMarcadosAbaixo(catalogo, item.codigo, marcadas) : 0
                  }
                  onAlternarSelecao={alternarSelecao}
                  onAlternarNo={alternarNo}
                />
              ))
            ) : (
              <p className="sem-contas">
                {catalogoCompleto.lista.length
                  ? `Nenhuma conta do grupo ${modulo.grupo} corresponde ao filtro.`
                  : "O ERP não devolveu classificações para esta visão contábil."}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <p className="modulo-aviso">
        <Icone nome="info" tamanho={16} />
        Salvo na hora. Marcar um grupo inclui tudo abaixo dele — as contas aparecem marcadas com
        <strong> via {"<código>"}</strong> e acompanham o ERP: conta nova criada nesse grupo entra
        sozinha. Para escolher conta por conta, desmarque o grupo. Linhas em cinza são só estrutura,
        de outro grupo contábil.
      </p>
    </main>
  );
}
