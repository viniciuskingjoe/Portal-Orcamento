import { useEffect, useState } from "react";

import Icone from "./Icone.jsx";
import Seletor from "./Seletor.jsx";
import { MODULOS } from "../dados/modulos.js";
import { EDITA, NADA, VE, gerarConcessoes, lerTerritorio, proximoEstado } from "../dados/territorio.js";

// ============================================================================
// PERMISSÃO EM DUAS PERGUNTAS
//
// ONDE a pessoa atua, escolhido uma vez, e O QUE ela faz em cada módulo.
//
// A tela antiga pedia módulo, filial e centro juntos e concedia o produto
// cartesiano: três módulos, duas filiais e quatro centros viravam 24 linhas que
// depois ninguém relia. Aqui o território não multiplica, e a matriz responde
// "o que essa pessoa pode?" de bate-pronto, sem união mental.
//
// Grava exatamente as mesmas concessões de antes — muda só a autoria.
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

      {/* Três botões em vez de um que cicla: com o ciclo, chegar em "nada"
          partindo de "vê" custa dois cliques e um deles concede edição no
          caminho — numa tela de permissão isso é o tipo de deslize que ninguém
          percebe ter feito. */}
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

export default function EditorPermissao({ usuario, catalogos, onSalvar }) {
  const inicial = lerTerritorio(usuario.acessos ?? []);
  const [filiais, setFiliais] = useState([]);
  const [centros, setCentros] = useState([]);
  const [matriz, setMatriz] = useState(inicial.matriz);
  const [salvando, setSalvando] = useState(false);

  // Trocar de usuário sem fechar o painel precisa recarregar, senão a matriz
  // mostrada é a da pessoa anterior.
  useEffect(() => {
    const lido = lerTerritorio(usuario.acessos ?? []);
    setMatriz(lido.matriz);
    setFiliais([...new Set(lido.territorio.map((l) => l.filial).filter(Boolean))]);
    setCentros([...new Set(lido.territorio.map((l) => l.centro).filter(Boolean))]);
  }, [usuario.login, usuario.acessos]);

  // Nenhuma filial escolhida = todas; o mesmo para centro. É o "tudo" que o
  // modelo de concessão já entende como nulo.
  const territorio = [];
  const asFiliais = filiais.length ? filiais : [null];
  const osCentros = centros.length ? centros : [null];
  asFiliais.forEach((filial) => {
    osCentros.forEach((centro) => territorio.push({ filial, centro }));
  });

  const concessoes = gerarConcessoes(territorio, matriz);
  const nenhum = MODULOS.every((modulo) => (matriz[modulo.id] ?? NADA) === NADA);

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar(concessoes);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="editor-permissao">
      <div className="editor-permissao__onde">
        <h4>Onde atua</h4>
        <div className="editor-permissao__campos">
          <label>
            <span>Filial</span>
            <Seletor
              multiplo
              rotuloTodos="todas as filiais"
              valor={filiais}
              opcoes={catalogos.filiais.map((item) => ({ valor: item.id, rotulo: item.nome }))}
              aoEscolher={setFiliais}
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
              aoEscolher={setCentros}
              buscaVazia="Nenhum centro com esse nome."
            />
          </label>
        </div>
      </div>

      <div className="editor-permissao__oque">
        <h4>O que faz em cada módulo</h4>
        <div className="matriz-modulos">
          {MODULOS.map((modulo) => (
            <LinhaModulo
              key={modulo.id}
              modulo={modulo}
              estado={matriz[modulo.id] ?? NADA}
              onAlternar={(estado) => setMatriz((atual) => ({ ...atual, [modulo.id]: estado }))}
            />
          ))}
        </div>
      </div>

      <div className="editor-permissao__rodape">
        <p className="editor-permissao__previa">
          {nenhum ? (
            <>
              Nenhum módulo marcado — salvar assim <strong>tira todo o acesso</strong> desta pessoa.
            </>
          ) : (
            <>
              Vai gravar {concessoes.length}{" "}
              {concessoes.length === 1 ? "concessão" : "concessões"}.
            </>
          )}
        </p>
        <button
          type="button"
          className="botao botao--primario botao--compacto"
          onClick={salvar}
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar permissão"}
        </button>
      </div>
    </div>
  );
}
