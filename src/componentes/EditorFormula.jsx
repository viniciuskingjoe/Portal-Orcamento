import { useState } from "react";

import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";
import Modal from "./Modal.jsx";
import { validarFormula } from "../dados/formula.js";
import { FUNCIONARIOS_TOKEN } from "../dados/plano.js";

// ============================================================================
// EDITOR DE FÓRMULA (Despesas com pessoal)
//
// Toda conta nasce FIXA — digita o valor, como em qualquer outro módulo. Aqui
// se decide se ela vira CALCULADA: o valor sai de uma expressão que referencia
// outras contas do mesmo centro, formato V[código] — ex. o 13º salário como
// (V[salário] + V[abono]) / 12.
//
// O valor de uma conta calculada (fixa ou calculada, tanto faz) é sempre POR
// PESSOA — quem multiplica pelo Nº de funcionários do centro é a aba Total,
// não esta tela.
// ============================================================================

export default function EditorFormula({ conta, descricao, contasDisponiveis, formulaAtual, onSalvar, onFechar }) {
  const [tipo, setTipo] = useState(formulaAtual ? "calculado" : "fixo");
  const [expressao, setExpressao] = useState(formulaAtual?.expressao ?? "");
  const [salvando, setSalvando] = useState(false);

  const erro = tipo === "calculado" ? validarFormula(expressao) : null;
  const referencias = (contasDisponiveis ?? []).filter((item) => item.codigo !== conta);

  // Traduz V[código] pro nome da conta, pra quem está lendo confirmar que
  // referenciou a certa — só da fórmula REAL digitada, não do placeholder de
  // exemplo (que nem chega a ser uma fórmula válida).
  function comDescricoes(bruta) {
    return bruta.replace(/V\[([^\]]*)\]/g, (encontrado, codigo) => {
      if (codigo === FUNCIONARIOS_TOKEN) return "V[Nº de funcionários]";
      const item = (contasDisponiveis ?? []).find((c) => c.codigo === codigo);
      return `V[${item?.descricao ?? codigo}]`;
    });
  }
  const descricaoDaFormula = expressao.trim() ? comDescricoes(expressao) : "";

  async function salvar() {
    if (tipo === "calculado" && erro) return;
    setSalvando(true);
    try {
      await onSalvar(tipo === "calculado" ? expressao.trim() : null);
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Fixa ou calculada" onFechar={onFechar} largura="560px">
      <div className="modal__conteudo">
        <p className="editor-formula__conta">
          <code>{conta}</code>
          <span>{descricao}</span>
        </p>

        <div className="abas" role="group" aria-label="Tipo de valor">
          <button
            type="button"
            className={tipo === "fixo" ? "is-active" : ""}
            aria-pressed={tipo === "fixo"}
            onClick={() => setTipo("fixo")}
          >
            Valor fixo
          </button>
          <button
            type="button"
            className={tipo === "calculado" ? "is-active" : ""}
            aria-pressed={tipo === "calculado"}
            onClick={() => setTipo("calculado")}
          >
            Valor calculado
          </button>
        </div>

        {tipo === "fixo" ? (
          <p className="campo__ajuda">Digita o valor na coluna Planejado.</p>
        ) : (
          <>
            <p className="campo__ajuda">
              Valor do Planejado sai desta expressão em vez de ser digitado.
            </p>

            <label className="campo">
              <span>Fórmula</span>
              <textarea
                rows={3}
                value={expressao}
                onChange={(evento) => setExpressao(evento.target.value)}
                placeholder={`Ex: (V[${referencias[0]?.codigo ?? "código"}] + V[${referencias[1]?.codigo ?? "código"}]) / 12`}
                aria-invalid={erro ? "true" : "false"}
              />
            </label>

            {erro ? <p className="erro-campo">{erro}</p> : null}
            {!erro && descricaoDaFormula ? (
              <p className="editor-formula__descricao">{descricaoDaFormula}</p>
            ) : null}

            <button
              type="button"
              className="botao-texto editor-formula__funcionarios"
              onClick={() =>
                setExpressao((atual) => `${atual}${atual.trim() ? " " : ""}V[${FUNCIONARIOS_TOKEN}]`)
              }
            >
              <Icone nome="users" tamanho={14} />
              Nº de funcionários
            </button>

            {referencias.length ? (
              <div className="editor-formula__referencias">
                <span>Contas deste centro para referenciar</span>
                <div className="editor-formula__lista">
                  {referencias.map((item) => (
                    <button
                      type="button"
                      key={item.codigo}
                      className="botao-texto"
                      title={item.descricao}
                      onClick={() =>
                        setExpressao((atual) => `${atual}${atual.trim() ? " " : ""}V[${item.codigo}]`)
                      }
                    >
                      <code>{item.codigo}</code> {item.descricao}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="modal__rodape">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar} disabled={salvando || (tipo === "calculado" && !!erro)}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
      </div>
    </Modal>
  );
}
