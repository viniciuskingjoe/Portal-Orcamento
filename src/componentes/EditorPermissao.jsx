import { useEffect, useState } from "react";

import ArvoreTerritorio from "./ArvoreTerritorio.jsx";
import Icone from "./Icone.jsx";
import ModalConfirmacao from "./ModalConfirmacao.jsx";
import { MODULOS } from "../dados/modulos.js";
import {
  EDITA,
  TUDO,
  VE,
  gerarConcessoesDeModulos,
  lerModulos,
  territorioIrrestrito,
} from "../dados/territorio.js";

const NIVEIS = [
  {
    valor: VE,
    rotulo: "Somente visualizar",
    titulo: "Pode consultar os valores, mas não pode lançar nem alterar",
  },
  {
    valor: EDITA,
    rotulo: "Pode editar",
    titulo: "Pode consultar, lançar e alterar valores",
  },
];

function assinaturaDasConcessoes(lista = []) {
  return lista
    .map(
      (acesso) =>
        `${acesso.modulo ?? "*"}|${acesso.filial ?? "*"}|${acesso.centro ?? "*"}|${acesso.podeEditar ? "1" : "0"}`
    )
    .sort()
    .join("\n");
}

function resumoDoTerritorio(territorio = [], catalogos) {
  if (territorioIrrestrito(territorio)) return "Todas as filiais e centros";

  const filiais = [...new Set(territorio.map((lugar) => lugar.filial).filter(Boolean))];
  const filiaisInteiras = new Set(
    territorio.filter((lugar) => lugar.filial && lugar.centro == null).map((lugar) => lugar.filial)
  );
  const centrosGerais = new Set(
    territorio.filter((lugar) => lugar.filial == null && lugar.centro).map((lugar) => lugar.centro)
  );

  if (!filiais.length && centrosGerais.size) {
    return `${centrosGerais.size} ${centrosGerais.size === 1 ? "centro" : "centros"} em todas as filiais`;
  }

  if (filiais.length === 1) {
    const filial = catalogos.filiais.find((item) => item.id === filiais[0]);
    if (filiaisInteiras.has(filiais[0])) return `${filial?.nome ?? filiais[0]} · todos os centros`;
    const quantidade = new Set(
      territorio
        .filter((lugar) => lugar.filial === filiais[0] && lugar.centro)
        .map((lugar) => lugar.centro)
    ).size;
    return `${filial?.nome ?? filiais[0]} · ${quantidade} ${quantidade === 1 ? "centro" : "centros"}`;
  }

  const algumaParcial = filiais.some((filial) => !filiaisInteiras.has(filial));
  return `${filiais.length} filiais${algumaParcial ? " · centros específicos" : " · todos os centros"}`;
}

function rotuloDoNivel(config) {
  if (!config.ligado) return "Sem acesso";
  if (config.nivel === EDITA) return "Pode editar";
  if (config.nivel === VE) return "Somente visualiza";
  return "Níveis diferentes";
}

function LinhaModuloPermissao({
  modulo,
  config,
  catalogos,
  aberto,
  onAbrir,
  onMudar,
  somenteLeitura,
}) {
  function alternarAcesso(evento) {
    const ligado = evento.target.checked;
    onMudar({
      ...config,
      ligado,
      territorio: ligado && !config.territorio.length ? [TUDO] : config.territorio,
    });
    onAbrir(ligado);
  }

  return (
    <div
      className={`modulo-permissao ${config.ligado ? "is-ligado" : ""} ${aberto ? "is-aberto" : ""}`}
    >
      <div className="modulo-permissao__cabecalho">
        <button
          type="button"
          className="modulo-permissao__abrir"
          aria-expanded={aberto}
          disabled={!config.ligado}
          onClick={() => onAbrir(!aberto)}
        >
          <span className="modulo-permissao__icone">
            <Icone nome={modulo.icone} tamanho={17} />
          </span>
          <span className="modulo-permissao__texto">
            <strong>{modulo.titulo}</strong>
            <small>
              {config.ligado ? resumoDoTerritorio(config.territorio, catalogos) : "Ative para configurar"}
            </small>
          </span>
          <span
            className={`modulo-permissao__nivel-resumo ${config.nivel === EDITA ? "is-edicao" : ""}`}
          >
            {rotuloDoNivel(config)}
          </span>
          <Icone nome="chevron" tamanho={17} />
        </button>

        <label className="modulo-permissao__interruptor">
          <span>Acesso</span>
          <input
            type="checkbox"
            role="switch"
            checked={config.ligado}
            disabled={somenteLeitura}
            aria-label={`Acesso ao módulo ${modulo.titulo}`}
            onChange={alternarAcesso}
          />
          <span className="modulo-permissao__trilho" aria-hidden="true">
            <span />
          </span>
        </label>
      </div>

      {aberto && config.ligado ? (
        <div className="modulo-permissao__config">
          <div className="modulo-permissao__config-topo">
            <span className="modulo-permissao__config-texto">
              <strong>Permissão no módulo</strong>
              <small>Defina se a pessoa apenas consulta ou também altera valores.</small>
            </span>
            <span
              className="matriz-linha__estados matriz-linha__estados--largo"
              role="group"
              aria-label={`Permissão em ${modulo.titulo}`}
            >
              {NIVEIS.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  className={`matriz-estado ${opcao.valor === EDITA ? "matriz-estado--edita" : ""} ${config.nivel === opcao.valor ? "is-ativo" : ""}`}
                  aria-pressed={config.nivel === opcao.valor}
                  disabled={somenteLeitura}
                  title={opcao.titulo}
                  onClick={() => onMudar({ ...config, nivel: opcao.valor })}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </span>
          </div>

          {config.nivel == null ? (
            <p className="modulo-permissao__aviso">
              <Icone nome="info" tamanho={16} />
              Este módulo tem permissões diferentes conforme o local. Escolha um nível acima para
              unificar antes de alterar as filiais e centros de custo.
            </p>
          ) : (
            <div className="modulo-permissao__escopo">
              <span className="modulo-permissao__config-texto">
                <strong>Filiais e centros de custo</strong>
                <small>Use acesso total ou escolha o escopo por filial.</small>
              </span>
              <ArvoreTerritorio
                territorio={config.territorio}
                catalogos={catalogos}
                somenteLeitura={somenteLeitura}
                onMudar={(territorio) => onMudar({ ...config, territorio })}
                onSemEscopo={() => {
                  onMudar({ ...config, ligado: false });
                  onAbrir(false);
                }}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function EditorPermissao({ usuario, catalogos, onSalvar, onAlteracao, somenteLeitura = false }) {
  const [inicial] = useState(() => {
    const modulos = lerModulos(usuario.acessos ?? []);
    return {
      modulos,
      assinatura: assinaturaDasConcessoes(gerarConcessoesDeModulos(modulos)),
    };
  });
  const [modulos, setModulos] = useState(inicial.modulos);
  const [assinaturaSalva, setAssinaturaSalva] = useState(inicial.assinatura);
  const [moduloAberto, setModuloAberto] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoZerar, setConfirmandoZerar] = useState(false);

  const concessoes = gerarConcessoesDeModulos(modulos);
  const assinaturaAtual = assinaturaDasConcessoes(concessoes);
  const alterado = assinaturaAtual !== assinaturaSalva;
  const ativos = MODULOS.filter((modulo) => modulos[modulo.id]?.ligado);
  const editaveis = ativos.filter((modulo) => modulos[modulo.id]?.nivel === EDITA).length;
  const apenasVe = ativos.filter((modulo) => modulos[modulo.id]?.nivel === VE).length;
  const mistos = ativos.filter((modulo) => modulos[modulo.id]?.nivel == null).length;
  const vaiZerar = !concessoes.length && (usuario.acessos ?? []).length > 0;

  useEffect(() => {
    onAlteracao?.(alterado);
    return () => onAlteracao?.(false);
  }, [alterado, onAlteracao]);

  async function salvar() {
    setSalvando(true);
    try {
      const salvo = await onSalvar(concessoes);
      if (salvo !== false) {
        setAssinaturaSalva(assinaturaAtual);
        setConfirmandoZerar(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  function aplicarATodos(nivel) {
    setModulos((atuais) => {
      const novo = {};
      for (const modulo of MODULOS) {
        novo[modulo.id] = nivel
          ? { ...atuais[modulo.id], ligado: true, territorio: [TUDO], nivel }
          : { ...atuais[modulo.id], ligado: false };
      }
      return novo;
    });
    if (!nivel) setModuloAberto(null);
  }

  return (
    <div className="editor-permissao">
      <div className="editor-permissao__atalhos">
        <span className="editor-permissao__atalhos-texto">
          <strong>Aplicar a todos</strong>
          <small>Atalhos para configurar os oito módulos de uma vez.</small>
        </span>
        <span className="editor-permissao__atalhos-acoes">
          <button
            type="button"
            className="botao-texto"
            disabled={somenteLeitura}
            onClick={() => aplicarATodos(VE)}
          >
            Somente visualizar
          </button>
          <button
            type="button"
            className="botao-texto"
            disabled={somenteLeitura}
            onClick={() => aplicarATodos(EDITA)}
          >
            Pode editar
          </button>
          <button
            type="button"
            className="botao-texto botao-texto--perigo"
            disabled={somenteLeitura}
            onClick={() => aplicarATodos(null)}
          >
            Remover todos
          </button>
        </span>
      </div>

      <div className="modulos-permissao">
        {MODULOS.map((modulo) => (
          <LinhaModuloPermissao
            key={modulo.id}
            modulo={modulo}
            config={modulos[modulo.id]}
            catalogos={catalogos}
            aberto={moduloAberto === modulo.id}
            onAbrir={(abrir) => setModuloAberto(abrir ? modulo.id : null)}
            somenteLeitura={somenteLeitura}
            onMudar={(novo) =>
              setModulos((atuais) => ({
                ...atuais,
                [modulo.id]: novo,
              }))
            }
          />
        ))}
      </div>

      <div className={`editor-permissao__rodape ${alterado ? "is-alterado" : ""}`}>
        <span className="editor-permissao__resumo">
          <strong>
            {ativos.length} de {MODULOS.length} módulos com acesso
          </strong>
          {ativos.length ? (
            <small>
              {editaveis ? `${editaveis} ${editaveis === 1 ? "permite" : "permitem"} editar` : ""}
              {editaveis && (apenasVe || mistos) ? " · " : ""}
              {apenasVe ? `${apenasVe} ${apenasVe === 1 ? "é" : "são"} somente leitura` : ""}
              {mistos ? `${editaveis || apenasVe ? " · " : ""}${mistos} com níveis por local` : ""}
            </small>
          ) : (
            <small>Esta pessoa não verá dados do orçamento.</small>
          )}
        </span>

        <span className={`editor-permissao__estado ${alterado ? "is-pendente" : ""}`}>
          {alterado ? "Alterações não salvas" : "Permissões atualizadas"}
        </span>

        <button
          type="button"
          className="botao botao--primario botao--compacto"
          onClick={() => (vaiZerar ? setConfirmandoZerar(true) : salvar())}
          disabled={salvando || !alterado || somenteLeitura}
        >
          {salvando ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>

      {confirmandoZerar ? (
        <ModalConfirmacao
          nome={usuario.nome}
          titulo="Remover todos os acessos"
          verbo="remover as permissões de"
          rotuloConfirmar="Remover acessos"
          mensagem={
            <>
              <strong>{usuario.nome}</strong> continua entrando no portal, mas não verá nem poderá
              alterar dados até receber uma nova permissão.
            </>
          }
          onConfirmar={salvar}
          onFechar={() => setConfirmandoZerar(false)}
        />
      ) : null}
    </div>
  );
}
