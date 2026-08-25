import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Icone from "./Icone.jsx";

// ============================================================================
// SELETOR COM BUSCA
//
// Substitui o `<select>` nativo onde a lista é longa. O nativo não deixa
// escolher para que lado abre — com 25 filiais ou 42 centros ele sobe e cobre a
// tela inteira —, não filtra e não aceita estilo.
//
// Este abre SEMPRE para baixo, filtra enquanto se digita e é navegável só pelo
// teclado. Nas listas curtas o campo de busca some sozinho: caixa de busca para
// escolher entre três coisas é ruído.
//
// Em `multiplo`, `valor` é uma lista e o painel FICA ABERTO enquanto se marca —
// fechar a cada clique obrigaria a reabrir para cada item, que é justamente o
// trabalho que o modo múltiplo existe para evitar. Lista vazia quer dizer
// "todos", que é o padrão de qualquer concessão.
// ============================================================================

const MINIMO_PARA_BUSCAR = 8;

export default function Seletor({
  valor,
  opcoes,
  aoEscolher,
  placeholder = "Selecionar…",
  buscaVazia = "Nada encontrado.",
  desabilitado = false,
  multiplo = false,
  rotuloTodos = "todos",
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [destacado, setDestacado] = useState(0);
  const [posicao, setPosicao] = useState(null);

  const raiz = useRef(null);
  const botao = useRef(null);
  const painel = useRef(null);
  const campo = useRef(null);
  const lista = useRef(null);
  const idBase = useId();

  const marcados = multiplo ? new Set(valor ?? []) : null;
  const escolhida = multiplo ? null : opcoes.find((opcao) => opcao.valor === valor);
  const comBusca = opcoes.length >= MINIMO_PARA_BUSCAR;

  const estaMarcada = (opcao) => (multiplo ? marcados.has(opcao.valor) : opcao.valor === valor);

  // Nada marcado é "todos": a concessão sem restrição é o caso normal, e
  // obrigar a marcar 42 centros para dizer "todos" seria absurdo.
  const rotuloDoCampo = () => {
    if (!multiplo) return escolhida?.rotulo ?? placeholder;
    if (!marcados.size) return rotuloTodos;
    if (marcados.size === 1) {
      const unica = opcoes.find((opcao) => marcados.has(opcao.valor));
      return unica?.rotulo ?? rotuloTodos;
    }
    return `${marcados.size} selecionados`;
  };

  const filtradas = useMemo(() => {
    const alvo = termo.trim().toLowerCase();
    if (!alvo) return opcoes;
    return opcoes.filter((opcao) =>
      `${opcao.rotulo} ${opcao.detalhe ?? ""}`.toLowerCase().includes(alvo)
    );
  }, [opcoes, termo]);

  // Fecha ao clicar fora. O painel é portal pra <body> (ver abaixo), então
  // "fora" precisa checar os dois: o campo (`raiz`) e o painel (`painel`) —
  // um clique numa opção não é filho do campo no DOM.
  useEffect(() => {
    if (!aberto) return undefined;
    const aoClicar = (evento) => {
      if (!raiz.current?.contains(evento.target) && !painel.current?.contains(evento.target)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  // O painel é `position: fixed` a partir daqui — não fica preso pela
  // `overflow-y: auto` de um modal ou de qualquer contêiner com rolagem no
  // meio do caminho (é o que cortava a lista pela metade dentro de um modal).
  // Precisa se realinhar em QUALQUER rolagem, não só a da janela — por isso o
  // listener vai na fase de captura em `document`, que enxerga a rolagem de
  // um contêiner interno mesmo sem ela borbulhar até a `window`.
  useEffect(() => {
    if (!aberto) return undefined;
    const medir = () => {
      const retangulo = botao.current?.getBoundingClientRect();
      if (retangulo) {
        setPosicao({ top: retangulo.bottom + 4, left: retangulo.left, width: retangulo.width });
      }
    };
    medir();
    document.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      document.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [aberto]);

  useEffect(() => {
    if (aberto && comBusca) campo.current?.focus();
  }, [aberto, comBusca]);

  // Mantém o item destacado visível: navegar por teclado até o fim de uma lista
  // de 42 centros sem rolar não serve para nada.
  useEffect(() => {
    if (!aberto) return;
    lista.current
      ?.querySelector(`[data-indice="${destacado}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [destacado, aberto]);

  function abrir() {
    if (desabilitado) return;
    setTermo("");
    setDestacado(Math.max(0, filtradas.findIndex(estaMarcada)));
    setAberto(true);
  }

  function escolher(opcao) {
    if (!multiplo) {
      aoEscolher(opcao.valor);
      setAberto(false);
      setTermo("");
      return;
    }

    const proximo = new Set(marcados);
    if (proximo.has(opcao.valor)) proximo.delete(opcao.valor);
    else proximo.add(opcao.valor);
    aoEscolher([...proximo]);
  }

  function teclado(evento) {
    if (evento.key === "Escape") {
      setAberto(false);
      return;
    }
    if (evento.key === "Enter") {
      evento.preventDefault();
      if (!aberto) return abrir();
      const alvo = filtradas[destacado];
      if (alvo) escolher(alvo);
      return;
    }
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberto) return abrir();
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setDestacado((atual) => {
        const proximo = atual + passo;
        if (proximo < 0) return filtradas.length - 1;
        if (proximo >= filtradas.length) return 0;
        return proximo;
      });
    }
  }

  return (
    <div className={`seletor ${aberto ? "is-aberto" : ""}`} ref={raiz}>
      <button
        type="button"
        ref={botao}
        className="seletor__campo"
        disabled={desabilitado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? `${idBase}-lista` : undefined}
        aria-activedescendant={
          aberto && filtradas.length ? `${idBase}-${destacado}` : undefined
        }
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={teclado}
      >
        <span className={escolhida || marcados?.size ? "" : "seletor__vazio"}>{rotuloDoCampo()}</span>
        <Icone nome="chevron" tamanho={14} />
      </button>

      {aberto && posicao
        ? createPortal(
            // Dentro de um <dialog> aberto com `showModal()`, o navegador
            // promove o SUBÁRVORE do diálogo pra "top layer" — um portal pra
            // `document.body` cairia FORA dela e renderizaria atrás do
            // modal, mesmo com z-index alto. Portando pro próprio <dialog>
            // (fora de `.modal__conteudo`, que é quem corta com overflow),
            // o painel continua na top layer e escapa do corte.
            <div
              className="seletor__painel"
              ref={painel}
              style={{
                position: "fixed",
                top: posicao.top,
                left: posicao.left,
                right: "auto",
                width: posicao.width,
              }}
            >
              {comBusca ? (
                <input
                  ref={campo}
                  className="seletor__busca"
                  value={termo}
                  onChange={(evento) => {
                    setTermo(evento.target.value);
                    setDestacado(0);
                  }}
                  onKeyDown={teclado}
                  placeholder="Filtrar…"
                  aria-label="Filtrar opções"
                  role="combobox"
                  aria-expanded={aberto}
                  aria-controls={`${idBase}-lista`}
                  aria-activedescendant={filtradas.length ? `${idBase}-${destacado}` : undefined}
                />
              ) : null}

              {multiplo && marcados.size ? (
                <button type="button" className="seletor__limpar" onClick={() => aoEscolher([])}>
                  Limpar seleção ({marcados.size})
                </button>
              ) : null}

              <ul
                className="seletor__lista"
                role="listbox"
                id={`${idBase}-lista`}
                aria-multiselectable={multiplo}
                ref={lista}
              >
                {filtradas.map((opcao, indice) => (
                  <li key={opcao.valor}>
                    <button
                      type="button"
                      id={`${idBase}-${indice}`}
                      data-indice={indice}
                      role="option"
                      aria-selected={estaMarcada(opcao)}
                      className={[
                        "seletor__opcao",
                        multiplo ? "seletor__opcao--multipla" : "",
                        estaMarcada(opcao) ? "is-escolhida" : "",
                        indice === destacado ? "is-destacada" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setDestacado(indice)}
                      onClick={() => escolher(opcao)}
                    >
                      {multiplo ? (
                        <span className="checkbox-visual" aria-hidden="true">
                          {estaMarcada(opcao) ? <Icone nome="check" tamanho={13} /> : null}
                        </span>
                      ) : null}
                      {opcao.detalhe ? <code>{opcao.detalhe}</code> : null}
                      <span>{opcao.rotulo}</span>
                      {!multiplo && estaMarcada(opcao) ? <Icone nome="check" tamanho={14} /> : null}
                    </button>
                  </li>
                ))}

                {!filtradas.length ? <li className="seletor__vazio-lista">{buscaVazia}</li> : null}
              </ul>
            </div>,
            raiz.current?.closest("dialog") ?? document.body
          )
        : null}
    </div>
  );
}
