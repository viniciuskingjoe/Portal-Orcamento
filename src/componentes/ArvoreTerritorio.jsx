import { useState } from "react";

import Icone from "./Icone.jsx";
import {
  TUDO,
  alternarCentroNaArvore,
  alternarFilialNaArvore,
  nosDoTerritorio,
  territorioIrrestrito,
} from "../dados/territorio.js";

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLowerCase();
}

function corresponde(item, termo) {
  const alvo = normalizar(termo.trim());
  if (!alvo) return true;
  return normalizar(`${item.id} ${item.nome}`).includes(alvo);
}

function resumoDaFilial(no, totalCentros) {
  if (!no || no.estado === "vazio") return "Sem acesso";
  if (no.estado === "total") return "Todos os centros";
  return `${no.marcadosAbaixo} de ${totalCentros} centros`;
}

// Editor mestre-detalhe do território. A lista de filiais fica estável à
// esquerda e apenas os centros da filial em foco aparecem à direita. Isso
// preserva a relação filial × centro sem repetir a árvore inteira na tela.
export default function ArvoreTerritorio({
  territorio,
  catalogos,
  onMudar,
  onSemEscopo,
  somenteLeitura = false,
}) {
  const irrestrito = territorioIrrestrito(territorio);
  const [personalizando, setPersonalizando] = useState(() => !irrestrito);
  // Enquanto true, a árvore mostra tudo desmarcado mesmo sem o território ter
  // mudado ainda — só ao entrar em "Selecionar locais" vindo de "toda a
  // empresa". O primeiro clique grava e desliga esta bandeira.
  const [emBranco, setEmBranco] = useState(false);
  const [filialAtivaId, setFilialAtivaId] = useState(() => catalogos.filiais[0]?.id ?? null);
  const [filtroFiliais, setFiltroFiliais] = useState("");
  const [filtroCentros, setFiltroCentros] = useState("");

  if (!catalogos.filiais.length) {
    return <p className="sem-contas">Nenhuma filial disponível.</p>;
  }

  const filialAtiva =
    catalogos.filiais.find((filial) => filial.id === filialAtivaId) ?? catalogos.filiais[0];
  const nos = nosDoTerritorio(territorio, catalogos, new Set([filialAtiva.id]), {
    forcarVazio: emBranco,
  });
  const filiais = nos.filter((no) => no.nivel === 0);
  const centros = nos.filter((no) => no.nivel === 1 && no.filialId === filialAtiva.id);
  const filiaisVisiveis = catalogos.filiais.filter((filial) => corresponde(filial, filtroFiliais));
  const centrosVisiveis = catalogos.centros.filter((centro) => corresponde(centro, filtroCentros));
  const porFilial = new Map(filiais.map((no) => [no.codigo, no]));
  const porCentro = new Map(centros.map((no) => [no.centroId, no]));
  const filialAtivaNo = porFilial.get(filialAtiva.id);
  const quantidadeFiliais = filiais.filter((no) => no.estado !== "vazio").length;
  const mostrarPersonalizado = personalizando || !irrestrito;

  function aplicar(novoTerritorio) {
    if (!novoTerritorio.length) {
      onSemEscopo?.();
      return;
    }
    onMudar(novoTerritorio);
  }

  function escolherTudo() {
    setPersonalizando(false);
    setEmBranco(false);
    onMudar([TUDO]);
  }

  // Vindo de "toda a empresa", entra em branco — a pessoa marca só o que
  // quer, não desmarca as filiais que não quer de um total já preenchido.
  // O território guardado não muda aqui; só muda no primeiro clique real.
  function escolherPersonalizado() {
    setPersonalizando(true);
    if (irrestrito) setEmBranco(true);
  }

  function alternarFilial(no) {
    if (emBranco) {
      setEmBranco(false);
      aplicar([{ filial: no.codigo, centro: null }]);
      return;
    }
    aplicar(alternarFilialNaArvore(territorio, catalogos, no.codigo, no.estado));
  }

  function alternarCentro(no) {
    if (emBranco) {
      setEmBranco(false);
      aplicar([{ filial: filialAtiva.id, centro: no.centroId }]);
      return;
    }
    aplicar(
      alternarCentroNaArvore(
        territorio,
        catalogos,
        filialAtiva.id,
        no.centroId,
        no.estado === "total"
      )
    );
  }

  // Com busca ativa, "todos"/"limpar" agem só sobre os centros filtrados
  // visíveis na tela — do contrário um filtro de 2 resultados concedia (ou
  // apagava) os outros 40 centros que a pessoa não estava nem olhando.
  const filtroCentrosAtivo = filtroCentros.trim().length > 0;
  const centrosAlvo = filtroCentrosAtivo ? centrosVisiveis : catalogos.centros;

  function marcarTodosOsCentros() {
    if (emBranco) {
      setEmBranco(false);
      aplicar(
        centrosAlvo.length === catalogos.centros.length
          ? [{ filial: filialAtiva.id, centro: null }]
          : centrosAlvo.map((centro) => ({ filial: filialAtiva.id, centro: centro.id }))
      );
      return;
    }
    const faltaAlgum = centrosAlvo.some(
      (centro) => filialAtivaNo?.estado !== "total" && porCentro.get(centro.id)?.estado !== "total"
    );
    if (!faltaAlgum) return;
    let atual = territorio;
    for (const centro of centrosAlvo) {
      atual = alternarCentroNaArvore(atual, catalogos, filialAtiva.id, centro.id, false);
    }
    aplicar(atual);
  }

  function limparFilial() {
    if (emBranco) return;
    const algumMarcado = centrosAlvo.some(
      (centro) => filialAtivaNo?.estado === "total" || porCentro.get(centro.id)?.estado === "total"
    );
    if (!algumMarcado) return;
    let atual = territorio;
    for (const centro of centrosAlvo) {
      atual = alternarCentroNaArvore(atual, catalogos, filialAtiva.id, centro.id, true);
    }
    aplicar(atual);
  }

  return (
    <div className="escopo-territorio">
      <div className="escopo-territorio__modo" role="group" aria-label="Abrangência do acesso">
        <button
          type="button"
          className={!mostrarPersonalizado ? "is-ativo" : ""}
          aria-pressed={!mostrarPersonalizado}
          disabled={somenteLeitura}
          onClick={escolherTudo}
        >
          <span>Toda a empresa</span>
          <small>Todas as filiais e centros</small>
        </button>
        <button
          type="button"
          className={mostrarPersonalizado ? "is-ativo" : ""}
          aria-pressed={mostrarPersonalizado}
          disabled={somenteLeitura}
          onClick={escolherPersonalizado}
        >
          <span>Selecionar locais</span>
          <small>Escolher filiais e centros</small>
        </button>
      </div>

      {mostrarPersonalizado ? (
        <div className="escopo-territorio__grade">
          <section className="escopo-territorio__painel" aria-labelledby="escopo-filiais-titulo">
            <header className="escopo-territorio__cabecalho">
              <span>
                <strong id="escopo-filiais-titulo">Filiais</strong>
                <small>
                  {quantidadeFiliais} {quantidadeFiliais === 1 ? "selecionada" : "selecionadas"}
                </small>
              </span>
            </header>

            <label className="escopo-territorio__busca">
              <Icone nome="search" tamanho={15} />
              <input
                value={filtroFiliais}
                onChange={(evento) => setFiltroFiliais(evento.target.value)}
                placeholder="Buscar filial…"
                aria-label="Buscar filial"
              />
            </label>

            <div className="escopo-territorio__lista escopo-territorio__lista--filiais">
              {filiaisVisiveis.map((filial) => {
                const no = porFilial.get(filial.id);
                const ativa = filial.id === filialAtiva.id;
                const estado = no?.estado ?? "vazio";
                return (
                  <div className={`escopo-filial ${ativa ? "is-ativa" : ""}`} key={filial.id}>
                    <button
                      type="button"
                      className="escopo-filial__check"
                      role="checkbox"
                      aria-checked={estado === "parcial" ? "mixed" : estado === "total"}
                      aria-label={`Alternar acesso à filial ${filial.nome}`}
                      disabled={somenteLeitura}
                      onClick={() => alternarFilial(no)}
                    >
                      <span className={`checkbox-visual ${estado === "parcial" ? "is-parcial" : ""}`}>
                        <Icone nome={estado === "parcial" ? "minus" : "check"} tamanho={12} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="escopo-filial__abrir"
                      aria-pressed={ativa}
                      onClick={() => {
                        setFilialAtivaId(filial.id);
                        setFiltroCentros("");
                      }}
                    >
                      <span className="escopo-filial__texto">
                        <strong>{filial.nome}</strong>
                        <small>{resumoDaFilial(no, catalogos.centros.length)}</small>
                      </span>
                      <code>{filial.id}</code>
                      <Icone nome="chevron" tamanho={15} />
                    </button>
                  </div>
                );
              })}

              {!filiaisVisiveis.length ? (
                <p className="escopo-territorio__vazio">Nenhuma filial encontrada.</p>
              ) : null}
            </div>
          </section>

          <section className="escopo-territorio__painel" aria-labelledby="escopo-centros-titulo">
            <header className="escopo-territorio__cabecalho">
              <span>
                <strong id="escopo-centros-titulo">Centros de custo</strong>
                <small>{filialAtiva.nome}</small>
              </span>
              <span className="escopo-territorio__acoes">
                <button
                  type="button"
                  className="botao-texto"
                  disabled={somenteLeitura}
                  onClick={marcarTodosOsCentros}
                >
                  {filtroCentrosAtivo ? `Selecionar os ${centrosAlvo.length} visíveis` : "Selecionar todos"}
                </button>
                <button
                  type="button"
                  className="botao-texto"
                  disabled={somenteLeitura}
                  onClick={limparFilial}
                >
                  {filtroCentrosAtivo ? "Limpar os visíveis" : "Limpar"}
                </button>
              </span>
            </header>

            <label className="escopo-territorio__busca">
              <Icone nome="search" tamanho={15} />
              <input
                value={filtroCentros}
                onChange={(evento) => setFiltroCentros(evento.target.value)}
                placeholder="Buscar centro de custo…"
                aria-label={`Buscar centro de custo em ${filialAtiva.nome}`}
              />
            </label>

            <div className="escopo-territorio__lista">
              {centrosVisiveis.map((centro) => {
                const no = porCentro.get(centro.id) ?? {
                  centroId: centro.id,
                  estado: "vazio",
                };
                const marcado = no.estado === "total";
                return (
                  <label className={`escopo-centro ${marcado ? "is-marcado" : ""}`} key={centro.id}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={somenteLeitura}
                      onChange={() => alternarCentro(no)}
                    />
                    <span className="checkbox-visual">
                      <Icone nome="check" tamanho={12} />
                    </span>
                    <span>{centro.nome}</span>
                    <code>{centro.id}</code>
                  </label>
                );
              })}

              {!centrosVisiveis.length ? (
                <p className="escopo-territorio__vazio">Nenhum centro de custo encontrado.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : (
        <p className="escopo-territorio__resumo">
          <Icone nome="check" tamanho={15} />
          Acesso em todas as filiais e centros de custo atuais e futuros.
        </p>
      )}
    </div>
  );
}
