import { useEffect, useMemo, useState } from "react";

import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";

// ============================================================================
// EDITAR UM GRUPO
//
// Um grupo é um nome e um punhado de centros de custo. Só isso: quais contas
// aparecem é assunto da visão do plano em que o DRE for lido, e escolher contas
// aqui de novo criaria uma segunda lista para discordar da primeira.
//
// Nome e centros são gravados juntos ao confirmar. Diferente do resto do
// portal, que grava a cada clique: aqui um grupo meio montado não significa
// nada, e salvar no fim deixa desistir sem deixar rastro.
// ============================================================================

export default function TelaGrupo({
  grupo,
  centros,
  somenteLeitura = false,
  carregando,
  erro,
  onRecarregar,
  onSalvar,
  onVoltar,
}) {
  const [nome, setNome] = useState(grupo.nome ?? "");
  const [escolhidos, setEscolhidos] = useState(grupo.centros ?? []);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");

  // Trocar de grupo sem sair da tela precisa recarregar os campos — senão o
  // formulário mostra o grupo anterior com o nome do novo no cabeçalho.
  useEffect(() => {
    setNome(grupo.nome ?? "");
    setEscolhidos(grupo.centros ?? []);
  }, [grupo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(() => {
    if (!termo) return centros;
    return centros.filter(
      (centro) =>
        centro.id.toLowerCase().includes(termo) || centro.nome.toLowerCase().includes(termo)
    );
  }, [centros, termo]);

  const alternarCentro = (id) =>
    setEscolhidos((atuais) =>
      atuais.includes(id) ? atuais.filter((centro) => centro !== id) : [...atuais, id]
    );

  async function salvar() {
    if (!nome.trim()) return setErroForm("Informe um nome para o grupo.");

    setSalvando(true);
    setErroForm("");
    try {
      await onSalvar({ id: grupo.id, nome: nome.trim(), centros: escolhidos });
    } catch (falha) {
      setErroForm(falha?.message ?? "Não foi possível salvar.");
      setSalvando(false);
    }
    return undefined;
  }

  return (
    <main className="conteudo">
      <Cabecalho
        titulo={grupo.nome || "Novo grupo"}
        subtitulo={
          somenteLeitura
            ? "Centros de custo reunidos neste recorte do DRE."
            : "Escolha os centros de custo que este recorte reúne para ler o DRE."
        }
        onVoltar={onVoltar}
        acao={
          somenteLeitura ? null : (
            <Botao onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar grupo"}
            </Botao>
          )
        }
      />

      <div className="filtros-orcamento">
        <label>
          <span>Nome do grupo</span>
          <input
            className="campo-fixo campo-fixo--editavel"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Ex.: Fábrica"
            disabled={somenteLeitura}
            autoFocus={!somenteLeitura}
          />
        </label>
      </div>

      {erroForm ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          {erroForm}
        </p>
      ) : null}

      {carregando ? <Carregando texto="Carregando centros de custo…" /> : null}
      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={onRecarregar} /> : null}

      {!carregando && !erro ? (
        <div className="contas-seletor">
          <div className="contas-seletor__topo">
            <label className="campo-busca">
              <input
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Filtrar por código ou nome…"
              />
            </label>
            <span className="contas-seletor__resumo">
              <small>
                {escolhidos.length} de {centros.length}{" "}
                {escolhidos.length === 1 ? "marcado" : "marcados"}
              </small>
              {!somenteLeitura ? (
                <button
                  type="button"
                  className="botao-texto"
                  onClick={() => setEscolhidos([])}
                  disabled={!escolhidos.length}
                >
                  Limpar
                </button>
              ) : null}
            </span>
          </div>

          {/* Grade em vez de coluna: são nomes curtos, e uma lista de 63 itens
              numa coluna só obriga a rolar para ver o que já estava marcado. */}
          <div className="contas-seletor__lista contas-seletor__lista--alta grade-centros">
            {visiveis.length ? (
              visiveis.map((centro) => (
                <label
                  className={`selecao-item selecao-item--marcavel centro-uso ${
                    escolhidos.includes(centro.id) ? "is-active" : ""
                  }`}
                  key={centro.id}
                >
                  <input
                    type="checkbox"
                    checked={escolhidos.includes(centro.id)}
                    onChange={() => alternarCentro(centro.id)}
                    disabled={somenteLeitura}
                  />
                  <span className="checkbox-visual">
                    <Icone nome="check" tamanho={13} />
                  </span>
                  <span className="centro-nome">
                    <code>{centro.id}</code>
                    <span>{centro.nome}</span>
                  </span>
                </label>
              ))
            ) : (
              <p className="sem-contas">
                {centros.length ? "Nenhum centro com esse nome." : "Nenhum centro de custo ativo."}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
