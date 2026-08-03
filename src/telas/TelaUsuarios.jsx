import { useEffect, useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import Seletor from "../componentes/Seletor.jsx";
import ModalConfirmacao from "../componentes/ModalConfirmacao.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import { MODULOS } from "../dados/modulos.js";
import {
  concessoesRedundantes,
  descreverConcessao,
  resumirAcessos,
} from "../dados/permissoes.js";
import { api } from "../lib/api.js";

// ============================================================================
// USUÁRIOS
//
// Quem entra vem do AD; o que a pessoa pode fazer é decidido aqui. As duas
// coisas são separadas de propósito: o AD diz quem existe na empresa, o portal
// diz quem orça o quê.
//
// A tela mostra o resumo do acesso SEM precisar expandir. Quem administra
// precisa varrer a lista e achar o errado, não abrir doze cartões para
// descobrir quem ficou sem permissão.
// ============================================================================

function Concessao({ acesso, catalogos, redundante, onAlternar, onRevogar }) {
  const oQue = descreverConcessao(acesso, catalogos);

  return (
    <li
      className={`concessao ${redundante ? "is-redundante" : ""}`}
      title={redundante ? "Não muda nada: já existe uma concessão mais ampla" : undefined}
    >
      {/* O poder alterna no próprio lugar. Antes, trocar "edita" por "só vê"
          exigia remover e conceder de novo a mesma combinação. */}
      <button
        type="button"
        className={`chip chip--${acesso.podeEditar ? "edicao" : "leitura"} chip--acao`}
        onClick={() => onAlternar(acesso)}
        title={acesso.podeEditar ? "Passar para somente leitura" : "Permitir lançar"}
      >
        {acesso.podeEditar ? "edita" : "só vê"}
      </button>

      <span className="concessao__texto">{oQue}</span>

      {/* `×` em vez da palavra: com uma dúzia de concessões, doze "Remover"
          competem com o conteúdo. O nome acessível diz de qual se trata —
          doze botões chamados "Remover" são indistinguíveis por leitor de tela. */}
      <button
        type="button"
        className="concessao__remover"
        aria-label={`Remover permissão ${oQue}`}
        title={`Remover permissão ${oQue}`}
        onClick={() => onRevogar(acesso.id)}
      >
        <Icone nome="close" tamanho={13} />
      </button>
    </li>
  );
}

// Vazio em qualquer dimensão vale por "todos" — e é assim que a concessão sem
// restrição continua sendo uma linha só, em vez de 42.
function combinar(modulos, filiais, centros) {
  const ou = (lista) => (lista.length ? lista : [null]);
  const combinacoes = [];

  ou(modulos).forEach((modulo) =>
    ou(filiais).forEach((filial) =>
      ou(centros).forEach((centro) => combinacoes.push({ modulo, filial, centro }))
    )
  );
  return combinacoes;
}

function NovaConcessao({ catalogos, onConceder }) {
  const [modulos, setModulos] = useState([]);
  const [filiais, setFiliais] = useState([]);
  const [centros, setCentros] = useState([]);

  // Marcar dois módulos e três centros são seis concessões. Dizer o número antes
  // de confirmar evita a surpresa de conceder mais do que se queria.
  const combinacoes = combinar(modulos, filiais, centros);
  const irrestrita = combinacoes.length === 1 && !modulos.length && !filiais.length && !centros.length;

  function conceder(podeEditar) {
    onConceder(combinacoes.map((combinacao) => ({ ...combinacao, podeEditar })));
    setModulos([]);
    setFiliais([]);
    setCentros([]);
  }

  return (
    <div className="nova-concessao">
      <div className="nova-concessao__campos">
        <label>
          <span>Módulo</span>
          <Seletor
            multiplo
            rotuloTodos="todos os módulos"
            valor={modulos}
            opcoes={catalogos.modulos.map((item) => ({ valor: item.id, rotulo: item.nome }))}
            aoEscolher={setModulos}
          />
        </label>

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

        {/* Os dois botões agem sobre o que está selecionado. Antes eram atalhos
            que ignoravam a seleção: marcar três filiais e clicar "somente
            leitura" concedia "tudo", diferente do que a prévia dizia. */}
        <span className="nova-concessao__botoes">
          <button
            type="button"
            className="botao botao--primario botao--compacto"
            onClick={() => conceder(true)}
          >
            {combinacoes.length > 1 ? `Conceder edição (${combinacoes.length})` : "Conceder edição"}
          </button>
          <button
            type="button"
            className="botao botao--secundario botao--compacto"
            onClick={() => conceder(false)}
          >
            {combinacoes.length > 1 ? `Conceder leitura (${combinacoes.length})` : "Conceder leitura"}
          </button>
        </span>
      </div>

      {/* Prévia: ler três seletores e imaginar o resultado é onde se erra —
          ainda mais quando a escolha múltipla multiplica as linhas. */}
      {/* Uma combinação cabe na frase; várias viram lista. Quebrar a frase para
          pendurar uma etiqueta só embaixo fica pior que dizer de uma vez. */}
      {irrestrita ? (
        <p className="nova-concessao__previa">
          Nada selecionado: vai conceder sobre <strong>tudo</strong>.
        </p>
      ) : combinacoes.length === 1 ? (
        <p className="nova-concessao__previa">
          Vai conceder <strong>{descreverConcessao(combinacoes[0], catalogos)}</strong>.
        </p>
      ) : (
        <div className="nova-concessao__previa">
          Vai conceder {combinacoes.length} combinações:
          <ul>
            {combinacoes.slice(0, 6).map((combinacao, indice) => (
              <li key={indice}>{descreverConcessao(combinacao, catalogos)}</li>
            ))}
            {combinacoes.length > 6 ? <li>e mais {combinacoes.length - 6}…</li> : null}
          </ul>
        </div>
      )}
    </div>
  );
}

function BuscaNoAd({ jaTem, onAdicionar }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  // Espera a digitação parar: o AD é consultado a cada busca, e uma consulta por
  // tecla castigaria o diretório sem precisar.
  useEffect(() => {
    const alvo = termo.trim();
    if (alvo.length < 2) {
      setAchados([]);
      setErro("");
      return undefined;
    }
    const id = setTimeout(() => {
      setBuscando(true);
      setErro("");
      api
        .buscarNoAd(alvo)
        .then(setAchados)
        .catch((falha) => setErro(falha.message))
        .finally(() => setBuscando(false));
    }, 400);
    return () => clearTimeout(id);
  }, [termo]);

  const curto = termo.trim().length > 0 && termo.trim().length < 2;

  return (
    <section className="painel-busca-ad">
      <label className="campo-busca">
        <input
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          placeholder="Buscar no Active Directory por nome ou login…"
          aria-label="Buscar usuário no AD"
        />
      </label>

      {curto ? <p className="sem-contas">Digite pelo menos duas letras.</p> : null}
      {buscando ? <p className="sem-contas">Procurando no diretório…</p> : null}
      {erro ? <p className="sem-contas">{erro}</p> : null}
      {!buscando && !erro && termo.trim().length >= 2 && !achados.length ? (
        <p className="sem-contas">Ninguém encontrado com esse termo.</p>
      ) : null}

      {achados.map((usuario) => {
        const dentro = jaTem.has(usuario.login);
        return (
          <button
            type="button"
            key={usuario.login}
            className="selecao-item selecao-item--conta"
            disabled={dentro}
            title={dentro ? "Já tem acesso ao portal" : "Dar acesso ao portal"}
            onClick={() => {
              onAdicionar(usuario);
              setTermo("");
            }}
          >
            <code>{usuario.login}</code>
            <span>
              {usuario.nome}
              {usuario.email ? ` · ${usuario.email}` : ""}
              {dentro ? " · já tem acesso" : ""}
            </span>
          </button>
        );
      })}
    </section>
  );
}

export default function TelaUsuarios({ filiais, centros, sessao, onVoltar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);
  const [filtro, setFiltro] = useState("");
  // Remover derruba a sessão aberta da pessoa na hora. Um clique de distância é
  // pouco para uma ação que tira alguém do sistema no meio do trabalho.
  const [aRemover, setARemover] = useState(null);

  const catalogos = useMemo(
    () => ({
      modulos: MODULOS.map((modulo) => ({ id: modulo.id, nome: modulo.titulo })),
      // Só as filiais que o portal usa: conceder acesso a uma filial que nem
      // aparece no orçamento não significa nada.
      filiais,
      centros,
    }),
    [filiais, centros]
  );

  async function recarregar() {
    try {
      setUsuarios(await api.usuarios());
      setErro("");
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    recarregar();
  }, []);

  const executar = (promessa) => promessa.then(recarregar).catch((falha) => setErro(falha.message));

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo
    ? usuarios.filter(
        (usuario) =>
          usuario.nome.toLowerCase().includes(termo) || usuario.login.toLowerCase().includes(termo)
      )
    : usuarios;

  const semPermissao = usuarios.filter((usuario) => !usuario.admin && !usuario.acessos.length).length;
  const jaTem = useMemo(() => new Set(usuarios.map((usuario) => usuario.login)), [usuarios]);

  if (carregando) {
    return (
      <main className="conteudo">
        <Carregando texto="Carregando usuários…" />
      </main>
    );
  }

  return (
    <main className="conteudo">
      <Cabecalho
        titulo="Usuários"
        subtitulo="Quem entra vem do Active Directory; o que cada um pode fazer é definido aqui"
        onVoltar={onVoltar}
      />

      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={recarregar} /> : null}

      <BuscaNoAd jaTem={jaTem} onAdicionar={(usuario) => executar(api.darAcesso(usuario))} />

      {/* Entrar e não ver nada é indistinguível de estar quebrado. Quem
          administra precisa ver isso sem abrir cartão por cartão. */}
      {semPermissao ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          <span>
            {semPermissao} {semPermissao === 1 ? "usuário entra" : "usuários entram"} no portal e não{" "}
            {semPermissao === 1 ? "vê" : "veem"} dado nenhum — falta conceder permissão.
          </span>
        </p>
      ) : null}

      <div className="usuarios-topo">
        <label className="campo-busca">
          <input
            value={filtro}
            onChange={(evento) => setFiltro(evento.target.value)}
            placeholder="Filtrar por nome ou login…"
            aria-label="Filtrar usuários"
          />
        </label>
        <span className="usuarios-topo__contagem">
          {visiveis.length} de {usuarios.length}
        </span>
      </div>

      <div className="lista-usuarios">
        {visiveis.map((usuario) => {
          const euMesmo = usuario.login === sessao?.login;
          const expandido = aberto === usuario.login;
          const travado = !usuario.admin && !usuario.acessos.length;

          return (
            <section
              className={`cartao-usuario ${travado ? "is-travado" : ""}`}
              key={usuario.login}
            >
              <header>
                <span className="cartao-usuario__nome">
                  <strong>{usuario.nome}</strong>
                  <code>{usuario.login}</code>
                </span>

                {/* O resumo é a informação principal do cartão fechado. */}
                <span className="cartao-usuario__resumo">
                  {resumirAcessos(usuario, catalogos)}
                </span>

                <span className="cartao-usuario__marcas">
                  {usuario.admin ? <span className="chip chip--receita">admin</span> : null}
                  {usuario.situacao !== "ativo" ? (
                    <span className="chip chip--despesa">inativo</span>
                  ) : null}
                  {/* O cadastro é compartilhado: quem saiu do AD fica inativo lá
                      e perde o acesso a todos os portais de uma vez. */}
                  {usuario.inativoNoCadastro ? (
                    <span className="chip chip--despesa">fora do AD</span>
                  ) : null}
                </span>

                <span className="cartao-usuario__acoes">
                  <button
                    type="button"
                    className="botao-texto"
                    aria-expanded={expandido}
                    onClick={() => setAberto(expandido ? null : usuario.login)}
                  >
                    {expandido ? "Fechar" : "Permissões"}
                  </button>

                  <button
                    type="button"
                    className="botao-texto"
                    disabled={euMesmo}
                    title={euMesmo ? "Você não pode alterar o seu próprio acesso" : undefined}
                    onClick={() => executar(api.alterarUsuario(usuario.login, { admin: !usuario.admin }))}
                  >
                    {usuario.admin ? "Tirar admin" : "Tornar admin"}
                  </button>

                  <button
                    type="button"
                    className="botao-texto botao-texto--perigo"
                    disabled={euMesmo}
                    title={euMesmo ? "Você não pode remover o seu próprio acesso" : undefined}
                    onClick={() => setARemover(usuario)}
                  >
                    Remover
                  </button>
                </span>
              </header>

              {expandido ? (
                <div className="cartao-usuario__permissoes">
                  {usuario.admin ? (
                    <p className="sem-contas">
                      Administrador vê e edita tudo — as concessões abaixo não são consultadas
                      enquanto ele for admin.
                    </p>
                  ) : null}

                  {(() => {
                    const redundantes = new Set(
                      concessoesRedundantes(usuario.acessos).map((acesso) => acesso.id)
                    );
                    return (
                      <>
                        {/* Conceder três filiais a quem já vê tudo não muda
                            nada, e faz o acesso parecer mais estreito do que é.
                            Dizer isso evita a leitura errada. */}
                        {redundantes.size ? (
                          <p className="sem-contas">
                            {redundantes.size === 1
                              ? "Uma concessão não muda nada"
                              : `${redundantes.size} concessões não mudam nada`}
                            : já existe outra mais ampla cobrindo o mesmo.
                          </p>
                        ) : null}

                        <ul className="lista-concessoes">
                          {usuario.acessos.map((acesso) => (
                            <Concessao
                              key={acesso.id}
                              acesso={acesso}
                              catalogos={catalogos}
                              redundante={redundantes.has(acesso.id)}
                              onAlternar={(alvo) =>
                                executar(
                                  api.concederAcessos(usuario.login, [
                                    { ...alvo, podeEditar: !alvo.podeEditar },
                                  ])
                                )
                              }
                              onRevogar={(id) => executar(api.revogarAcesso(usuario.login, id))}
                            />
                          ))}
                        </ul>
                      </>
                    );
                  })()}

                  <NovaConcessao
                    catalogos={catalogos}
                    onConceder={(lista) => executar(api.concederAcessos(usuario.login, lista))}
                  />
                </div>
              ) : null}
            </section>
          );
        })}

        {aRemover ? (
          <ModalConfirmacao
            titulo="Remover acesso ao portal"
            rotuloConfirmar="Remover acesso"
            mensagem={
              <>
                <strong>{aRemover.nome}</strong> perde o acesso ao Planejamento Orçamentário e a
                sessão dele é encerrada na hora
                {aRemover.acessos.length
                  ? `, junto com ${aRemover.acessos.length} ${aRemover.acessos.length === 1 ? "permissão" : "permissões"}`
                  : ""}
                . O cadastro continua para os outros portais.
              </>
            }
            onConfirmar={() => {
              executar(api.removerUsuario(aRemover.login));
              setARemover(null);
            }}
            onFechar={() => setARemover(null)}
          />
        ) : null}

        {!visiveis.length ? (
          <p className="sem-contas">
            {usuarios.length
              ? "Nenhum usuário corresponde ao filtro."
              : "Nenhum usuário com acesso ainda. Busque no Active Directory acima para adicionar."}
          </p>
        ) : null}
      </div>
    </main>
  );
}
