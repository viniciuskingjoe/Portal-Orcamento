import { useEffect, useMemo, useState } from "react";

import ArvoreTerritorio from "./ArvoreTerritorio.jsx";
import Botao from "./Botao.jsx";
import Icone from "./Icone.jsx";
import Modal from "./Modal.jsx";
import ModalConfirmacao from "./ModalConfirmacao.jsx";
import Seletor from "./Seletor.jsx";
import { MODULOS } from "../dados/modulos.js";
import {
  EDITA,
  TUDO,
  VE,
  aplicarNivelAosModulos,
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

function criarRascunho(usuario) {
  return {
    admin: usuario.admin === true,
    modulos: lerModulos(usuario.acessos ?? []),
  };
}

function assinaturaDoModulo(moduloId, config) {
  return assinaturaDasConcessoes(
    gerarConcessoesDeModulos({ [moduloId]: config })
  );
}

function assinaturaDoTerritorio(territorio = []) {
  return territorio
    .map((lugar) => `${lugar.filial ?? "*"}|${lugar.centro ?? "*"}`)
    .sort()
    .join("\n");
}

function resumoDoTerritorio(territorio = [], catalogos) {
  if (territorioIrrestrito(territorio)) return "Todas as filiais e centros";
  // Filial/centro mudam — desmarcar o último local não desliga mais o módulo
  // nem vira "tudo" sozinho, mas o resumo precisa dizer isso, senão parece
  // que a pessoa não escolheu 0 filiais de propósito.
  if (!territorio.length) return "Nenhum local definido ainda";

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
  alterado,
  onAbrir,
  onMudar,
  somenteLeitura,
}) {
  const idConfiguracao = `configuracao-${modulo.id}`;

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
          aria-controls={config.ligado ? idConfiguracao : undefined}
          disabled={!config.ligado}
          onClick={() => onAbrir(!aberto)}
        >
          <span className="modulo-permissao__icone">
            <Icone nome={modulo.icone} tamanho={17} />
          </span>
          <span className="modulo-permissao__texto">
            <span className="modulo-permissao__titulo-linha">
              <strong>{modulo.titulo}</strong>
              {alterado ? <span className="modulo-permissao__alterado">Alterado</span> : null}
            </span>
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
        <div className="modulo-permissao__config" id={idConfiguracao}>
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
                  className={`matriz-estado ${config.nivel === opcao.valor ? "is-ativo" : ""}`}
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
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function descreverMudancaDoModulo(modulo, atual, salvo) {
  if (!salvo?.ligado && atual?.ligado) {
    return `${modulo.titulo}: ativado para ${rotuloDoNivel(atual).toLowerCase()}`;
  }
  if (salvo?.ligado && !atual?.ligado) return `${modulo.titulo}: acesso removido`;

  const nivelMudou = atual?.nivel !== salvo?.nivel;
  const locaisMudaram =
    assinaturaDoTerritorio(atual?.territorio) !== assinaturaDoTerritorio(salvo?.territorio);
  if (nivelMudou && locaisMudaram) return `${modulo.titulo}: nível e locais alterados`;
  if (nivelMudou) return `${modulo.titulo}: ${rotuloDoNivel(atual)}`;
  if (locaisMudaram) return `${modulo.titulo}: locais alterados`;
  return `${modulo.titulo}: configuração alterada`;
}

export default function EditorPermissao({
  usuario,
  usuariosReferencia = [],
  catalogos,
  onSalvar,
  onAlteracao,
  somenteLeitura = false,
}) {
  const [salvo, setSalvo] = useState(() => criarRascunho(usuario));
  const [rascunho, setRascunho] = useState(() => criarRascunho(usuario));
  const [moduloAberto, setModuloAberto] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmacaoSalvar, setConfirmacaoSalvar] = useState(null);
  const [atalhoPendente, setAtalhoPendente] = useState(null);
  const [copiando, setCopiando] = useState(false);
  const [fonteLogin, setFonteLogin] = useState(null);
  const [origemCopia, setOrigemCopia] = useState(null);

  const { admin, modulos } = rascunho;
  const concessoes = gerarConcessoesDeModulos(modulos);
  const assinaturaAtual = assinaturaDasConcessoes(concessoes);
  const assinaturaSalva = assinaturaDasConcessoes(gerarConcessoesDeModulos(salvo.modulos));
  const perfilAlterado = admin !== salvo.admin;
  const acessosAlterados = assinaturaAtual !== assinaturaSalva;
  const alterado = perfilAlterado || acessosAlterados;
  const bloqueado = somenteLeitura || salvando;

  const modulosAlterados = MODULOS.filter(
    (modulo) =>
      assinaturaDoModulo(modulo.id, modulos[modulo.id]) !==
      assinaturaDoModulo(modulo.id, salvo.modulos[modulo.id])
  );
  const idsAlterados = new Set(modulosAlterados.map((modulo) => modulo.id));
  const ativos = MODULOS.filter((modulo) => modulos[modulo.id]?.ligado);
  const editaveis = ativos.filter((modulo) => modulos[modulo.id]?.nivel === EDITA).length;
  const apenasVe = ativos.filter((modulo) => modulos[modulo.id]?.nivel === VE).length;
  const mistos = ativos.filter((modulo) => modulos[modulo.id]?.nivel == null).length;
  const vaiFicarSemAcesso =
    !admin && !concessoes.length && (salvo.admin || assinaturaSalva.length > 0);

  const opcoesCopia = useMemo(
    () =>
      usuariosReferencia
        .filter(
          (item) =>
            item.login !== usuario.login &&
            item.situacao === "ativo" &&
            !item.inativoNoCadastro &&
            !item.admin &&
            (item.acessos ?? []).length > 0
        )
        .map((item) => ({ valor: item.login, rotulo: item.nome, detalhe: item.login })),
    [usuario.login, usuariosReferencia]
  );
  const fonte = usuariosReferencia.find((item) => item.login === fonteLogin) ?? null;
  const modulosDaFonte = fonte ? lerModulos(fonte.acessos ?? []) : null;
  const ativosDaFonte = fonte
    ? MODULOS.filter((modulo) => modulosDaFonte[modulo.id]?.ligado)
    : [];

  const descricoesAlteracoes = [
    ...(perfilAlterado
      ? [`Perfil: ${salvo.admin ? "Administrador" : "Usuário"} → ${admin ? "Administrador" : "Usuário"}`]
      : []),
    ...modulosAlterados.map((modulo) =>
      descreverMudancaDoModulo(modulo, modulos[modulo.id], salvo.modulos[modulo.id])
    ),
  ];
  const resumoAlteracoes = `${descricoesAlteracoes.slice(0, 2).join(" · ")}${
    descricoesAlteracoes.length > 2 ? ` · +${descricoesAlteracoes.length - 2}` : ""
  }`;

  useEffect(() => {
    onAlteracao?.(alterado);
    return () => onAlteracao?.(false);
  }, [alterado, onAlteracao]);

  async function salvar() {
    const enviado = rascunho;
    const acessosEnviados = gerarConcessoesDeModulos(enviado.modulos);
    setSalvando(true);
    try {
      const salvoComSucesso = await onSalvar({
        admin: enviado.admin,
        acessos: acessosEnviados,
      });
      if (salvoComSucesso !== false) {
        setSalvo(enviado);
        setConfirmacaoSalvar(null);
        setOrigemCopia(null);
      }
    } finally {
      setSalvando(false);
    }
  }

  function pedirParaSalvar() {
    if (admin && !salvo.admin) {
      setConfirmacaoSalvar("administrador");
      return;
    }
    if (vaiFicarSemAcesso) {
      setConfirmacaoSalvar("sem-acesso");
      return;
    }
    salvar();
  }

  function descartar() {
    setRascunho(salvo);
    setModuloAberto(null);
    setOrigemCopia(null);
    setAtalhoPendente(null);
  }

  function aplicarATodos(nivel) {
    setRascunho((atual) => ({
      ...atual,
      modulos: aplicarNivelAosModulos(atual.modulos, nivel),
    }));
    setAtalhoPendente(null);
    if (!nivel) setModuloAberto(null);
  }

  function solicitarAtalho(nivel) {
    if (!nivel) {
      aplicarATodos(null);
      return;
    }
    const semEscopo = MODULOS.filter((modulo) => !modulos[modulo.id]?.territorio?.length);
    if (semEscopo.length) {
      setAtalhoPendente({ nivel, quantidade: semEscopo.length });
      return;
    }
    aplicarATodos(nivel);
  }

  function aplicarCopia() {
    if (!fonte) return;
    setRascunho((atual) => ({
      ...atual,
      modulos: lerModulos(fonte.acessos ?? []),
    }));
    setOrigemCopia({ nome: fonte.nome, login: fonte.login });
    setModuloAberto(null);
    setCopiando(false);
    setFonteLogin(null);
  }

  const perfilBloqueado = bloqueado || usuario.adminPorAmbiente;
  const motivoPerfilBloqueado = somenteLeitura
    ? "Você não pode alterar o seu próprio perfil de acesso"
    : usuario.adminPorAmbiente
      ? "Definido na configuração do servidor — não muda por esta tela"
      : salvando
        ? "Aguarde o salvamento terminar"
        : undefined;

  return (
    <div className="editor-permissao editor-permissao--integrado" aria-busy={salvando}>
      <section className="usuarios-detalhe__secao usuarios-detalhe__perfil">
        <span className="usuarios-detalhe__secao-texto">
          <h3>Perfil de acesso</h3>
          <p id={`perfil-ajuda-${usuario.login}`}>
            Administrador configura o portal inteiro; usuário recebe acesso por módulo.
            {usuario.adminPorAmbiente
              ? " Este login está fixado como administrador na configuração do servidor — não muda por aqui."
              : " A escolha só passa a valer quando você salvar as alterações."}
            {somenteLeitura
              ? " Você não pode alterar o seu próprio perfil — evita se autobloquear sem querer."
              : ""}
          </p>
        </span>
        <span
          className="matriz-linha__estados matriz-linha__estados--largo"
          role="group"
          aria-label="Perfil de acesso"
          aria-describedby={`perfil-ajuda-${usuario.login}`}
        >
          <button
            type="button"
            className={`matriz-estado ${!admin ? "is-ativo" : ""}`}
            aria-pressed={!admin}
            disabled={perfilBloqueado}
            title={motivoPerfilBloqueado}
            onClick={() => setRascunho((atual) => ({ ...atual, admin: false }))}
          >
            Usuário
          </button>
          <button
            type="button"
            className={`matriz-estado ${admin ? "is-ativo" : ""}`}
            aria-pressed={admin}
            disabled={perfilBloqueado}
            title={motivoPerfilBloqueado}
            onClick={() => setRascunho((atual) => ({ ...atual, admin: true }))}
          >
            Administrador
          </button>
        </span>
      </section>

      {admin ? (
        <section className={`usuarios-admin-total ${perfilAlterado ? "is-pendente" : ""}`}>
          <span className="usuarios-admin-total__icone">
            <Icone nome="check" tamanho={18} />
          </span>
          <span>
            <strong>{perfilAlterado ? "Acesso total ao salvar" : "Acesso total"}</strong>
            <p>
              Administradores visualizam, editam e configuram todos os módulos, filiais e centros
              de custo. As permissões granulares ficam guardadas, mas não são usadas enquanto este
              perfil estiver ativo.
              {perfilAlterado ? " Esta promoção ainda está no rascunho." : ""}
              {usuario.adminPorAmbiente
                ? " Definido na configuração do servidor — não pode ser removido por esta tela."
                : ""}
              {somenteLeitura && !usuario.adminPorAmbiente
                ? " Este é o seu usuário — você não pode tirar o seu próprio acesso de administrador."
                : ""}
            </p>
          </span>
        </section>
      ) : (
        <section className="usuarios-detalhe__secao usuarios-detalhe__modulos">
          <div className="usuarios-detalhe__modulos-topo">
            <span className="usuarios-detalhe__secao-texto">
              <h3>Acesso por módulo</h3>
              <p>
                {somenteLeitura
                  ? "Você pode conferir o seu próprio acesso aqui, mas não alterá-lo — evita se autobloquear sem querer."
                  : "Ative um módulo e abra a linha para definir locais e permissão."}
              </p>
            </span>
            <Botao
              variante="secundario"
              className="botao--compacto editor-permissao__copiar-botao"
              disabled={bloqueado || !opcoesCopia.length}
              title={
                opcoesCopia.length
                  ? "Usar os módulos, locais e níveis de outro usuário como base"
                  : "Não há outro usuário comum com permissões para copiar"
              }
              onClick={() => setCopiando(true)}
            >
              <Icone nome="copy" tamanho={15} />
              Copiar permissões
            </Botao>
          </div>

          {origemCopia ? (
            <p className="editor-permissao__copia-aplicada" role="status">
              <Icone nome="copy" tamanho={15} />
              Base copiada de <strong>{origemCopia.nome}</strong>. Revise abaixo e salve para aplicar.
            </p>
          ) : null}

          <div className="editor-permissao__atalhos">
            <span className="editor-permissao__atalhos-texto">
              <strong>Aplicar a todos</strong>
              <small>
                Mantém os locais já escolhidos. Módulos sem locais usam toda a empresa.
              </small>
            </span>
            <span className="editor-permissao__atalhos-acoes">
              <button
                type="button"
                className="botao-texto"
                disabled={bloqueado}
                onClick={() => solicitarAtalho(VE)}
              >
                Somente visualizar
              </button>
              <button
                type="button"
                className="botao-texto"
                disabled={bloqueado}
                onClick={() => solicitarAtalho(EDITA)}
              >
                Pode editar
              </button>
              <button
                type="button"
                className="botao-texto botao-texto--perigo"
                disabled={bloqueado}
                onClick={() => solicitarAtalho(null)}
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
                alterado={idsAlterados.has(modulo.id)}
                onAbrir={(abrir) => setModuloAberto(abrir ? modulo.id : null)}
                somenteLeitura={bloqueado}
                onMudar={(novo) =>
                  setRascunho((atual) => ({
                    ...atual,
                    modulos: {
                      ...atual.modulos,
                      [modulo.id]: novo,
                    },
                  }))
                }
              />
            ))}
          </div>
        </section>
      )}

      <div className={`editor-permissao__rodape ${alterado ? "is-alterado" : ""}`}>
        <span className="editor-permissao__resumo">
          <strong>
            {alterado
              ? `${descricoesAlteracoes.length} ${descricoesAlteracoes.length === 1 ? "alteração pendente" : "alterações pendentes"}`
              : admin
                ? "Administrador com acesso total"
                : `${ativos.length} de ${MODULOS.length} módulos com acesso`}
          </strong>
          {alterado ? (
            <small title={descricoesAlteracoes.join(" · ")}>{resumoAlteracoes}</small>
          ) : admin ? (
            <small>As permissões por módulo permanecem guardadas para uma futura troca de perfil.</small>
          ) : ativos.length ? (
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

        <span
          className={`editor-permissao__estado ${alterado ? "is-pendente" : ""}`}
          role="status"
          aria-live="polite"
        >
          {salvando ? "Salvando…" : alterado ? "Alterações não salvas" : "Acesso atualizado"}
        </span>

        <span className="editor-permissao__rodape-acoes">
          <button
            type="button"
            className="botao botao--secundario botao--compacto"
            onClick={descartar}
            disabled={bloqueado || !alterado}
          >
            Descartar
          </button>

          <button
            type="button"
            className="botao botao--primario botao--compacto"
            onClick={pedirParaSalvar}
            disabled={bloqueado || !alterado}
          >
            {salvando ? "Salvando…" : "Salvar alterações"}
          </button>
        </span>
      </div>

      {copiando ? (
        <Modal titulo="Copiar permissões" onFechar={() => setCopiando(false)} largura="640px">
          <div className="modal__conteudo copiar-permissoes">
            <p className="copiar-permissoes__intro">
              Escolha um usuário comum para usar seus módulos, filiais, centros de custo e níveis
              como base. O perfil não será alterado e nada será salvo antes da sua confirmação na
              tela principal.
            </p>

            <label className="copiar-permissoes__campo">
              <span>Usuário de origem</span>
              <Seletor
                valor={fonteLogin}
                opcoes={opcoesCopia}
                aoEscolher={setFonteLogin}
                placeholder="Escolher usuário…"
                buscaVazia="Nenhum usuário encontrado."
                desabilitado={salvando}
              />
            </label>

            {fonte ? (
              <section className="copiar-permissoes__previa" aria-live="polite">
                <header>
                  <span>
                    <strong>{fonte.nome}</strong>
                    <code>{fonte.login}</code>
                  </span>
                  <span className="chip chip--leitura">
                    {ativosDaFonte.length} {ativosDaFonte.length === 1 ? "módulo" : "módulos"}
                  </span>
                </header>
                <ul>
                  {ativosDaFonte.map((modulo) => {
                    const config = modulosDaFonte[modulo.id];
                    return (
                      <li key={modulo.id}>
                        <span>{modulo.titulo}</span>
                        <small>
                          {rotuloDoNivel(config)} · {resumoDoTerritorio(config.territorio, catalogos)}
                        </small>
                      </li>
                    );
                  })}
                </ul>
                {alterado ? (
                  <p className="copiar-permissoes__aviso">
                    Aplicar esta base substituirá as alterações ainda não salvas nos módulos.
                  </p>
                ) : null}
              </section>
            ) : (
              <p className="copiar-permissoes__vazio">
                Selecione alguém para conferir as permissões antes de copiar.
              </p>
            )}
          </div>
          <div className="modal__rodape">
            <Botao variante="secundario" onClick={() => setCopiando(false)}>
              Cancelar
            </Botao>
            <Botao disabled={!fonte || salvando} onClick={aplicarCopia}>
              Aplicar ao rascunho
            </Botao>
          </div>
        </Modal>
      ) : null}

      {atalhoPendente ? (
        <ModalConfirmacao
          titulo="Aplicar nível aos oito módulos"
          icone="info"
          perigo={false}
          rotuloConfirmar="Aplicar aos módulos"
          mensagem={
            <>
              {atalhoPendente.quantidade} {atalhoPendente.quantidade === 1 ? "módulo ainda não possui" : "módulos ainda não possuem"}{" "}
              locais configurados. {atalhoPendente.quantidade === 1 ? "Ele receberá" : "Eles receberão"}{" "}
              <strong>Toda a empresa</strong>; os demais manterão seus locais atuais.
            </>
          }
          onConfirmar={() => aplicarATodos(atalhoPendente.nivel)}
          onFechar={() => setAtalhoPendente(null)}
        />
      ) : null}

      {confirmacaoSalvar === "administrador" ? (
        <ModalConfirmacao
          titulo="Conceder acesso de administrador"
          icone="info"
          perigo={false}
          rotuloConfirmar="Conceder e salvar"
          mensagem={
            <>
              <strong>{usuario.nome}</strong> poderá visualizar, editar e configurar todos os
              módulos, filiais e centros de custo. Confirme somente se essa pessoa deve administrar
              o portal inteiro.
            </>
          }
          onConfirmar={salvar}
          onFechar={() => setConfirmacaoSalvar(null)}
        />
      ) : null}

      {confirmacaoSalvar === "sem-acesso" ? (
        <ModalConfirmacao
          titulo="Salvar usuário sem permissões"
          rotuloConfirmar="Salvar sem acesso aos dados"
          mensagem={
            <>
              <strong>{usuario.nome}</strong> continuará entrando no portal, mas não verá nem poderá
              alterar dados até receber uma nova permissão.
            </>
          }
          onConfirmar={salvar}
          onFechar={() => setConfirmacaoSalvar(null)}
        />
      ) : null}
    </div>
  );
}
