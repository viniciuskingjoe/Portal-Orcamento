import { useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import EstadoVazio from "../componentes/EstadoVazio.jsx";
import Icone from "../componentes/Icone.jsx";

const DESCRICAO = {
  filiais: {
    titulo: "Filiais",
    texto: "Unidades cadastradas no ERP. Usadas para distribuir os valores do orçamento.",
    origem: "dbo.FILIAIS",
    colunas: ["Código", "Nome", "Tipo"],
  },
  centros: {
    titulo: "Centro de Custos",
    texto: "Centros de custo ativos no ERP.",
    origem: "dbo.CTB_CENTRO_CUSTO",
    colunas: ["Código", "Nome"],
  },
};

// Somente leitura: estas listas são do ERP. Editar aqui daria a impressão de que
// o portal manda no cadastro, e a próxima carga sobrescreveria a alteração.
export default function TelaListaErp({ tela, lista, onVoltar }) {
  const [busca, setBusca] = useState("");
  const dados = DESCRICAO[tela];

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(
      (item) =>
        item.id.toLowerCase().includes(termo) || item.nome.toLowerCase().includes(termo)
    );
  }, [lista, busca]);

  return (
    <main className="conteudo">
      <Cabecalho titulo={dados.titulo} subtitulo={dados.texto} onVoltar={onVoltar} />

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
        <span className="arvore-contagem">
          {visiveis.length} de {lista.length}
        </span>
      </div>

      <div className="lista-crud">
        <div className={`lista-crud__topo lista-crud__topo--${tela}`}>
          {dados.colunas.map((coluna) => (
            <span key={coluna}>{coluna}</span>
          ))}
        </div>
        {visiveis.map((item) => (
          <div className={`linha-crud linha-crud--${tela}`} key={item.id}>
            <code>{item.id}</code>
            <strong>{item.nome}</strong>
            {tela === "filiais" ? <span className="linha-crud__meta">{item.tipo ?? "—"}</span> : null}
          </div>
        ))}
        {!visiveis.length ? (
          <EstadoVazio
            texto={lista.length ? "Nenhum item corresponde ao filtro." : "O ERP não devolveu registros."}
          />
        ) : null}
      </div>
    </main>
  );
}
