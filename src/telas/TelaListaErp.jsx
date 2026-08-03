import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";

const DESCRICAO = {
  filiais: {
    titulo: "Filiais",
    texto: "Marque as filiais que o portal usa. As demais somem dos planos e das visões.",
    origem: "dbo.FILIAIS",
  },
  centros: {
    titulo: "Centro de Custos",
    texto: "Centros de custo ativos no ERP.",
    origem: "dbo.CTB_CENTRO_CUSTO",
  },
};

// A lista vem do ERP e é somente leitura. O que o portal decide é quais filiais
// participam — daí o checkbox só existir aqui.
//
// `somenteLeitura` vale para quem não administra: quais filiais o portal usa é
// configuração GLOBAL, muda o que todo mundo vê. A lista aparece recortada pelo
// que a pessoa pode ver, mas sem as caixas.
export default function TelaListaErp({
  tela,
  lista,
  ativas,
  somenteLeitura = false,
  onAlternarAtiva,
  onDefinirAtivas,
  onVoltar,
}) {
  const [busca, setBusca] = useState("");
  const dados = DESCRICAO[tela];
  const texto =
    somenteLeitura && tela === "filiais"
      ? "As filiais que você pode ver. Quem define quais o portal usa é um administrador."
      : dados.texto;
  const selecionavel = tela === "filiais" && !somenteLeitura;

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(
      (item) => item.id.toLowerCase().includes(termo) || item.nome.toLowerCase().includes(termo)
    );
  }, [lista, busca]);

  const marcadas = ativas ? new Set(ativas) : null;
  const estaAtiva = (id) => !marcadas || marcadas.has(id);
  const quantasAtivas = marcadas ? lista.filter((i) => marcadas.has(i.id)).length : lista.length;

  return (
    <main className="conteudo">
      <Cabecalho titulo={dados.titulo} subtitulo={texto} onVoltar={onVoltar} />

      <div className="modulo-barra">
        <span className="chip chip--origem">
          <Icone nome="info" tamanho={13} />
          {dados.origem}
        </span>
        <label className="campo-busca">
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Filtrar por código ou nome…"
            aria-label={`Filtrar ${dados.titulo}`}
          />
        </label>
        {selecionavel ? (
          <>
            <span className="arvore-contagem">
              {quantasAtivas} de {lista.length} ativas
            </span>
            <button
              type="button"
              className="botao botao--secundario botao--compacto"
              onClick={() => onDefinirAtivas(lista.map((item) => item.id))}
            >
              Marcar todas
            </button>
            <button
              type="button"
              className="botao botao--secundario botao--compacto"
              onClick={() => onDefinirAtivas([])}
            >
              Limpar
            </button>
          </>
        ) : (
          <span className="arvore-contagem">
            {visiveis.length} de {lista.length}
          </span>
        )}
      </div>

      <div className="lista-crud">
        <div className={`lista-crud__topo lista-crud__topo--${tela}`}>
          {selecionavel ? <span>Usar</span> : null}
          <span>Código</span>
          <span>Nome</span>
          {tela === "filiais" ? <span>Tipo</span> : null}
        </div>

        {visiveis.map((item) =>
          selecionavel ? (
            <label className={`linha-crud linha-crud--filiais ${estaAtiva(item.id) ? "" : "is-inativa"}`} key={item.id}>
              <input
                type="checkbox"
                checked={estaAtiva(item.id)}
                onChange={() => onAlternarAtiva(item.id)}
              />
              <span className="checkbox-visual">
                <Icone nome="check" tamanho={13} />
              </span>
              <code>{item.id}</code>
              <strong>{item.nome}</strong>
              <span className="linha-crud__meta">{item.tipo ?? "—"}</span>
            </label>
          ) : (
            <div className="linha-crud linha-crud--centros" key={item.id}>
              <code>{item.id}</code>
              <strong>{item.nome}</strong>
            </div>
          )
        )}

        {!visiveis.length ? (
          <EstadoVazio
            texto={lista.length ? "Nenhum item corresponde ao filtro." : "O ERP não devolveu registros."}
          />
        ) : null}
      </div>
    </main>
  );
}
