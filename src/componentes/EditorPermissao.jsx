import { useEffect, useState } from "react";

import Icone from "./Icone.jsx";
import Seletor from "./Seletor.jsx";
import ModalConfirmacao from "./ModalConfirmacao.jsx";
import { MODULOS } from "../dados/modulos.js";
import {
  EDITA,
  NADA,
  VE,
  areaVazia,
  descreverAreas,
  gerarConcessoes,
  lerAreas,
  matrizVazia,
} from "../dados/territorio.js";

// ============================================================================
// PERMISSÃO POR ÁREA
//
// Cada área responde duas perguntas: ONDE a pessoa atua e O QUE faz lá. Várias
// áreas somam, que é o que permite "edita na KING&JOE, só vê na MEN HUB" —
// impossível com um território só.
//
// A tela antiga pedia módulo, filial e centro juntos e concedia o produto
// cartesiano: três módulos, duas filiais e quatro centros viravam 24 linhas que
// depois ninguém relia.
//
// Grava exatamente as mesmas concessões — muda só a autoria.
// ============================================================================

const ESTADOS = [
  { valor: NADA, rotulo: "—", titulo: "Sem acesso a este módulo" },
  { valor: VE, rotulo: "vê", titulo: "Vê os valores, não lança" },
  { valor: EDITA, rotulo: "edita", titulo: "Vê e lança" },
];

function LinhaModulo({ modulo, estado, onAlternar }) {
  return (
    <div className={`matriz-linha matriz-linha--${estado}`}>
      <span className="matriz-linha__nome">
        <Icone nome={modulo.icone} tamanho={16} />
        {modulo.titulo}
      </span>

      {/* Três botões em vez de um que cicla: com o ciclo, ir de "vê" para
          "nada" passa por "edita" — numa tela de permissão esse é o deslize que
          ninguém percebe ter feito. */}
      <span className="matriz-linha__estados" role="group" aria-label={modulo.titulo}>
        {ESTADOS.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            className={`matriz-estado ${estado === opcao.valor ? "is-ativo" : ""}`}
            aria-pressed={estado === opcao.valor}
            title={opcao.titulo}
            onClick={() => onAlternar(opcao.valor)}
          >
            {opcao.rotulo}
          </button>
        ))}
      </span>
    </div>
  );
}

function Area({ area, indice, total, catalogos, onMudar, onRemover }) {
  // Lista vazia = todas. É o "tudo" que o modelo de concessão entende por nulo.
  const filiais = [...new Set(area.territorio.map((l) => l.filial).filter(Boolean))];
  const centros = [...new Set(area.territorio.map((l) => l.centro).filter(Boolean))];

  const trocarLugares = (novasFiliais, novosCentros) => {
    const territorio = [];
    (novasFiliais.length ? novasFiliais : [null]).forEach((filial) => {
      (novosCentros.length ? novosCentros : [null]).forEach((centro) => {
        territorio.push({ filial, centro });
      });
    });
    onMudar({ ...area, territorio });
  };

  const marcarTodos = (estado) => {
    const matriz = matrizVazia();
    MODULOS.forEach((modulo) => {
      matriz[modulo.id] = estado;
    });
    onMudar({ ...area, matriz });
  };

  return (
    <div className="area-permissao">
      <div className="area-permissao__topo">
        <h4>{total > 1 ? `Área ${indice + 1}` : "Onde atua"}</h4>
        {total > 1 ? (
          <button
            type="button"
            className="botao-texto botao-texto--perigo"
            onClick={onRemover}
            title="Remover esta área"
          >
            Remover área
          </button>
        ) : null}
      </div>

      <div className="editor-permissao__campos">
        <label>
          <span>Filial</span>
          <Seletor
            multiplo
            rotuloTodos="todas as filiais"
            valor={filiais}
            opcoes={catalogos.filiais.map((item) => ({ valor: item.id, rotulo: item.nome }))}
            aoEscolher={(novas) => trocarLugares(novas, centros)}
            buscaVazia="Nenhuma filial com esse nome."
          />
        </label>
        <label>
          <span>Centro de custo</span>
          <Seletor
            multiplo
            rotuloTodos="todos os centros"
            valor={centros}
            opcoes={catalogos.centros.map((item) => ({
              valor: item.id,
              rotulo: item.nome,
              detalhe: item.id,
            }))}
            aoEscolher={(novos) => trocarLugares(filiais, novos)}
            buscaVazia="Nenhum centro com esse nome."
          />
        </label>
      </div>

      <div className="area-permissao__oque">
        <span className="area-permissao__rotulo">
          O que faz aqui
          {/* Marcar oito módulos um a um para dar leitura geral é o caso mais
              comum, e o mais chato. */}
          <span className="area-permissao__atalhos">
            <button type="button" className="botao-texto" onClick={() => marcarTodos(VE)}>
              tudo: vê
            </button>
            <button type="button" className="botao-texto" onClick={() => marcarTodos(EDITA)}>
              tudo: edita
            </button>
            <button type="button" className="botao-texto" onClick={() => marcarTodos(NADA)}>
              limpar
            </button>
          </span>
        </span>

        <div className="matriz-modulos">
          {MODULOS.map((modulo) => (
            <LinhaModulo
              key={modulo.id}
              modulo={modulo}
              estado={area.matriz[modulo.id] ?? NADA}
              onAlternar={(estado) =>
                onMudar({ ...area, matriz: { ...area.matriz, [modulo.id]: estado } })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EditorPermissao({ usuario, catalogos, onSalvar }) {
  const [areas, setAreas] = useState(() => {
    const lidas = lerAreas(usuario.acessos ?? []);
    return lidas.length ? lidas : [areaVazia()];
  });
  const [salvando, setSalvando] = useState(false);
  const [confirmandoZerar, setConfirmandoZerar] = useState(false);

  // Trocar de usuário sem fechar o painel precisa recarregar, senão a matriz
  // mostrada é a da pessoa anterior.
  useEffect(() => {
    const lidas = lerAreas(usuario.acessos ?? []);
    setAreas(lidas.length ? lidas : [areaVazia()]);
  }, [usuario.login, usuario.acessos]);

  const concessoes = gerarConcessoes(areas);
  const frases = descreverAreas(areas, catalogos);
  // Tirar toda a permissão de quem tinha alguma tem efeito quase igual ao de
  // remover a pessoa do portal — e remover pede confirmação. Salvar vazio sem
  // perguntar é um clique de distância de deixar alguém sem acesso.
  const vaiZerar = !concessoes.length && (usuario.acessos ?? []).length > 0;

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar(concessoes);
      setConfirmandoZerar(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="editor-permissao">
      {areas.map((area, indice) => (
        <Area
          key={indice}
          area={area}
          indice={indice}
          total={areas.length}
          catalogos={catalogos}
          onMudar={(nova) => setAreas((atuais) => atuais.map((a, i) => (i === indice ? nova : a)))}
          onRemover={() => setAreas((atuais) => atuais.filter((_, i) => i !== indice))}
        />
      ))}

      <button
        type="button"
        className="botao botao--secundario botao--compacto editor-permissao__nova"
        onClick={() => setAreas((atuais) => [...atuais, areaVazia()])}
      >
        <Icone nome="plus" tamanho={15} />
        Adicionar área
      </button>

      <div className="editor-permissao__rodape">
        {/* A frase é o que a pessoa vai poder; a contagem de concessões descreve
            o banco e não ajuda a conferir. */}
        <div className="editor-permissao__previa">
          {frases.length ? (
            frases.map((frase, indice) => <p key={indice}>{frase}</p>)
          ) : (
            <p>
              Nenhum módulo marcado — salvar assim <strong>tira todo o acesso</strong> desta pessoa.
            </p>
          )}
        </div>
        <button
          type="button"
          className="botao botao--primario botao--compacto"
          onClick={() => (vaiZerar ? setConfirmandoZerar(true) : salvar())}
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar permissão"}
        </button>
      </div>

      {confirmandoZerar ? (
        <ModalConfirmacao
          nome={usuario.nome}
          titulo="Tirar toda a permissão"
          verbo="tirar a permissão de"
          rotuloConfirmar="Tirar permissão"
          mensagem={
            <>
              <strong>{usuario.nome}</strong> continua com acesso ao portal, mas não vê nem lança
              nada até receber permissão de novo.
            </>
          }
          onConfirmar={salvar}
          onFechar={() => setConfirmandoZerar(false)}
        />
      ) : null}
    </div>
  );
}
