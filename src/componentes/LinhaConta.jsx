import { useEffect, useRef } from "react";

import Icone from "./Icone.jsx";

// ============================================================================
// UMA LINHA DA ÁRVORE DE CONTAS
//
// Usada pela visão (escolher o que o módulo orça) e pelo grupo de centro de
// custo (escolher o que o recorte lê). São telas diferentes com a mesma linha:
// mesmo recuo, mesma caixa, mesmo parcial. Manter duas cópias já custou uma —
// a do grupo tinha inventado uma classe que o CSS não conhecia, e o checkbox
// nativo aparecia cru ao lado do desenhado.
//
// Os extras (sinal, cascateável, contagem abaixo) só a visão usa; ficam
// opcionais para o grupo não precisar saber que existem.
// ============================================================================

function useIndeterminado(parcial) {
  const referencia = useRef(null);
  // `indeterminate` não existe como atributo HTML, só como propriedade.
  useEffect(() => {
    if (referencia.current) referencia.current.indeterminate = parcial;
  }, [parcial]);
  return referencia;
}

export default function LinhaConta({
  item,
  estado,
  marcadosAbaixo = 0,
  // Nó de estrutura com contas marcáveis abaixo: ganha caixa mesmo não sendo
  // conta do módulo. `codigosDaSubarvore` não coleta o próprio nó, então marcar
  // aqui só puxa as contas de verdade — é a alça da cascata.
  cascateavel = false,
  sinal = null,
  onInverter,
  onAlternar,
  onAlternarNo,
}) {
  const referencia = useIndeterminado(estado === "parcial");
  const marcavel = item.selecionavel !== false || cascateavel;

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

      {marcavel ? (
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
      ) : (
        <span className="arvore-conta__rotulo arvore-conta__rotulo--estrutura">
          <span className="arvore-conta__vazio" aria-hidden="true" />
          <code>{item.codigo}</code>
          <span>{item.descricao}</span>
        </span>
      )}

      {/* Folha marcada mostra como o valor dela é lido. O grupo contábil decide,
          mas o ERP às vezes classifica receita como despesa — daí poder inverter. */}
      {sinal ? (
        <button
          type="button"
          className={`arvore-conta__sinal is-${sinal.tipo} ${sinal.manual ? "is-invertido" : ""}`}
          onClick={() => onInverter(item.codigo, sinal)}
          title={
            sinal.manual
              ? `Definida à mão como ${sinal.tipo}. Clique para voltar ao automático (${sinal.automatico}).`
              : `Lida como ${sinal.tipo} (grupo ${sinal.grupo}). Clique para definir o contrário.`
          }
        >
          {sinal.tipo === "receita" ? "+ receita" : "− despesa"}
        </button>
      ) : null}

      {!item.aberto && estado === "parcial" && marcadosAbaixo > 0 ? (
        <span className="arvore-conta__abaixo">{marcadosAbaixo}</span>
      ) : null}
    </div>
  );
}
