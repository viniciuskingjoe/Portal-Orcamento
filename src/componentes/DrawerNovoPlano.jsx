import { useEffect, useRef } from "react";
import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";
import { resumoDaVisao } from "../dados/visao.js";

// Também é um `<dialog>`: só a apresentação é de painel lateral. Assim ganha
// Escape para fechar e retenção de foco sem código extra.
export default function DrawerNovoPlano({ valores, visoes, erro, onAlterar, onSalvar, onFechar }) {
  const referencia = useRef(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  const visaoEscolhida = visoes.find((visao) => visao.id === valores.visaoId) ?? null;
  const resumo = visaoEscolhida ? resumoDaVisao(visaoEscolhida) : null;

  return (
    <dialog
      ref={referencia}
      className="drawer"
      aria-label="Adicionar plano orçamentário"
      onCancel={(evento) => {
        evento.preventDefault();
        onFechar();
      }}
    >
      <form
        className="drawer__form"
        onSubmit={(evento) => {
          evento.preventDefault();
          onSalvar();
        }}
      >
        <div className="drawer__topo">
          <div>
            <span>Novo cenário</span>
            <h2>Adicionar plano orçamentário</h2>
          </div>
          <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar">
            <Icone nome="close" />
          </button>
        </div>

        <div className="drawer__conteudo">
          <label className="campo">
            <span>
              Nome <b>*</b>
            </span>
            <input
              value={valores.nome}
              onChange={(evento) => onAlterar({ nome: evento.target.value })}
              placeholder="Ex.: Orçamento Base 2027"
              autoFocus
            />
          </label>

          <label className="campo">
            <span>
              Visão <b>*</b>
            </span>
            <select
              value={valores.visaoId ?? ""}
              onChange={(evento) => onAlterar({ visaoId: evento.target.value || null })}
            >
              <option value="">Selecione uma visão…</option>
              {visoes.map((visao) => (
                <option value={visao.id} key={visao.id}>
                  {visao.nome}
                </option>
              ))}
            </select>
          </label>

          {resumo ? (
            <p className="campo__ajuda">
              {resumo.modulos} de {resumo.totalDeModulos} módulos configurados ·{" "}
              {resumo.contas} {resumo.contas === 1 ? "conta" : "contas"} vinculadas
            </p>
          ) : null}

          {!visoes.length ? (
            <p className="erro-campo" role="alert">
              Nenhuma visão cadastrada. Crie uma visão antes de criar o plano.
            </p>
          ) : null}

          <div className="campos-duplos">
            <label className="campo">
              <span>Período de</span>
              <input
                type="number"
                value={valores.inicio}
                onChange={(evento) => onAlterar({ inicio: evento.target.value })}
              />
            </label>
            <label className="campo">
              <span>Até</span>
              <input
                type="number"
                value={valores.fim}
                onChange={(evento) => onAlterar({ fim: evento.target.value })}
              />
            </label>
          </div>

          {erro ? (
            <p className="erro-campo" role="alert">
              {erro}
            </p>
          ) : null}

          <div className="drawer__nota">
            <Icone nome="info" tamanho={18} />
            <p>
              A visão define quais módulos e contas este plano orça. Filiais e centros de custo
              são configurados dentro do plano.
            </p>
          </div>
        </div>

        <div className="drawer__rodape">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <button type="submit" className="botao botao--primario" disabled={!visoes.length}>
            Salvar plano
          </button>
        </div>
      </form>
    </dialog>
  );
}
