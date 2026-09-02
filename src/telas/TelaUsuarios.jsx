import { useEffect, useMemo, useState } from "react";

import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import EditorPermissao from "../componentes/EditorPermissao.jsx";
import Modal from "../componentes/Modal.jsx";
import ModalConfirmacao from "../componentes/ModalConfirmacao.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import { MODULOS } from "../dados/modulos.js";
import { resumirAcessos } from "../dados/permissoes.js";
import { iniciais } from "../lib/formato.js";
import { api } from "../lib/api.js";

// ============================================================================
// USUÁRIOS
//
// Quem entra vem do AD; o que a pessoa pode fazer é decidido aqui. As duas
// coisas são separadas de propósito: o AD diz quem existe na empresa, o portal
// diz quem orça o quê.
//
// Mestre-detalhe em vez de doze cartões abertos ao mesmo tempo: a lista à
// esquerda é só nome, login e um status — quem administra varre e acha o
// errado sem ler frase nenhuma; escolher alguém abre a permissão dela por
// completo à direita, sem precisar expandir/recolher.
// ============================================================================

// Um status por vez, do mais importante para o mais rotineiro — a lista
// compacta só tem espaço para um selo, não para acumular todos os que se
// aplicam.
function statusUsuario(usuario) {
  if (usuario.situacao !== "ativo") return { texto: "inativo", classe: "chip--despesa" };
  if (usuario.inativoNoCadastro) return { texto: "fora do AD", classe: "chip--despesa" };
  if (usuario.admin) return { texto: "admin", classe: "chip--receita" };
  if (usuario.semSenhaDoPortal) return { texto: "1º acesso pendente", classe: "chip--leitura" };
  if (!usuario.acessos.length) return { texto: "sem acesso", classe: "chip--alerta" };
  return null;
}

// Cabeçalho + ações + editor de permissão do usuário escolhido na lista. Fica
// sempre visível para quem está selecionado — nada para expandir ou fechar.
function UsuarioDetalhe({
  usuario,
  euMesmo,
  catalogos,
  onAlternarAdmin,
  onRedefinirSenha,
  onRemover,
  onSalvarPermissao,
  onAlteracao,
  temAlteracoes,
}) {
  return (
    <>
      <header className="usuarios-detalhe__cabecalho">
        <div className="usuarios-detalhe__credencial">
          <span className="avatar-usuario avatar-usuario--grande">{iniciais(usuario.nome) ?? "?"}</span>
          <span className="usuarios-detalhe__texto">
            <h2>{usuario.nome}</h2>
            <code>{usuario.login}</code>
          </span>
          {usuario.semSenhaDoPortal ? (
            <span
              className="chip chip--leitura"
              title="Nunca entrou. No primeiro acesso usa a senha da rede e define a senha do portal."
            >
              1º acesso pendente
            </span>
          ) : null}
          {usuario.situacao !== "ativo" ? <span className="chip chip--despesa">inativo</span> : null}
          {/* O cadastro é compartilhado: quem saiu do AD fica inativo lá e
              perde o acesso a todos os portais de uma vez. */}
          {usuario.inativoNoCadastro ? <span className="chip chip--despesa">fora do AD</span> : null}
        </div>

        <span className="acoes-usuario" aria-label="Ações da credencial">
          {/* Redefinir derruba as sessões abertas da pessoa e obriga troca no
              próximo acesso — por isso passa por confirmação em vez de agir
              no clique. */}
          <Botao variante="secundario" className="botao--compacto acao-credencial--senha" onClick={onRedefinirSenha}>
            <Icone nome="chave" tamanho={15} />
            Redefinir senha
          </Botao>

          <Botao
            variante="secundario"
            className="botao--compacto acao-credencial--perigo"
            disabled={euMesmo}
            title={euMesmo ? "Você não pode remover o seu próprio acesso" : undefined}
            onClick={onRemover}
          >
            <Icone nome="trash" tamanho={15} />
            Remover
          </Botao>
        </span>
      </header>

      <section className="usuarios-detalhe__secao usuarios-detalhe__perfil">
        <span className="usuarios-detalhe__secao-texto">
          <h3>Perfil de acesso</h3>
          <p>Administrador configura o portal inteiro; usuário recebe acesso por módulo.</p>
        </span>
        <span className="matriz-linha__estados matriz-linha__estados--largo" role="group" aria-label="Perfil de acesso">
          <button
            type="button"
            className={`matriz-estado ${!usuario.admin ? "is-ativo" : ""}`}
            aria-pressed={!usuario.admin}
            disabled={euMesmo || temAlteracoes}
            title={
              euMesmo
                ? "Você não pode alterar o seu próprio perfil de acesso"
                : temAlteracoes
                  ? "Salve ou descarte as alterações dos módulos antes de trocar o perfil"
                  : undefined
            }
            onClick={() => usuario.admin && onAlternarAdmin()}
          >
            Usuário
          </button>
          <button
            type="button"
            className={`matriz-estado matriz-estado--edita ${usuario.admin ? "is-ativo" : ""}`}
            aria-pressed={usuario.admin}
            disabled={euMesmo || temAlteracoes}
            title={
              euMesmo
                ? "Você não pode alterar o seu próprio perfil de acesso"
                : temAlteracoes
                  ? "Salve ou descarte as alterações dos módulos antes de trocar o perfil"
                  : undefined
            }
            onClick={() => !usuario.admin && onAlternarAdmin()}
          >
            Administrador
          </button>
        </span>
      </section>

      {usuario.admin ? (
        <section className="usuarios-admin-total">
          <span className="usuarios-admin-total__icone">
            <Icone nome="check" tamanho={18} />
          </span>
          <span>
            <strong>Acesso total</strong>
            <p>
              Administradores visualizam e editam todos os módulos, filiais e centros de custo.
              As permissões granulares ficam guardadas, mas não são usadas enquanto este perfil
              estiver ativo.
            </p>
          </span>
        </section>
      ) : (
        <section className="usuarios-detalhe__secao usuarios-detalhe__modulos">
          <span className="usuarios-detalhe__secao-texto">
            <h3>Acesso por módulo</h3>
            <p>
              {euMesmo
                ? "Você pode conferir o seu próprio acesso aqui, mas não alterá-lo — evita se autobloquear sem querer."
                : "Ative um módulo e abra a linha para definir locais e permissão."}
            </p>
          </span>
          <EditorPermissao
            key={usuario.login}
            usuario={usuario}
            catalogos={catalogos}
            onSalvar={onSalvarPermissao}
            onAlteracao={onAlteracao}
            somenteLeitura={euMesmo}
          />
        </section>
      )}
    </>
  );
}

// Vazio em qualquer dimensão vale por "todos" — e é assim que a concessão sem
// restrição continua sendo uma linha só, em vez de 42.
function BuscaNoAd({ jaTem, onAdicionar }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [adicionandoLogin, setAdicionandoLogin] = useState(null);

  // Espera a digitação parar: o AD é consultado a cada busca, e uma consulta por
  // tecla castigaria o diretório sem precisar.
  useEffect(() => {
    const alvo = termo.trim();
    if (alvo.length < 2) {
      setAchados([]);
      setErro("");
      return undefined;
    }
    let ativo = true;
    const id = setTimeout(() => {
      setBuscando(true);
      setErro("");
      api
        .buscarNoAd(alvo)
        .then((resultado) => {
          if (ativo) setAchados(resultado);
        })
        .catch((falha) => {
          if (ativo) setErro(falha.message);
        })
        .finally(() => {
          if (ativo) setBuscando(false);
        });
    }, 400);
    return () => {
      ativo = false;
      clearTimeout(id);
    };
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
        const adicionandoEste = adicionandoLogin === usuario.login;
        return (
          <button
            type="button"
            key={usuario.login}
            className="selecao-item selecao-item--conta"
            disabled={dentro || adicionandoLogin != null}
            title={dentro ? "Já tem acesso ao portal" : "Dar acesso ao portal"}
            onClick={async () => {
              setAdicionandoLogin(usuario.login);
              try {
                const adicionado = await onAdicionar(usuario);
                if (adicionado !== false) setTermo("");
              } finally {
                setAdicionandoLogin(null);
              }
            }}
          >
            <code>{usuario.login}</code>
            <span>
              {usuario.nome}
              {usuario.email ? ` · ${usuario.email}` : ""}
              {dentro ? " · já tem acesso" : adicionandoEste ? " · adicionando…" : ""}
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
  // Login escolhido na lista à esquerda — não precisa sobreviver a um F5, só à
  // sessão de trabalho.
  const [selecionado, setSelecionado] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  // Remover derruba a sessão aberta da pessoa na hora. Um clique de distância é
  // pouco para uma ação que tira alguém do sistema no meio do trabalho.
  const [aRemover, setARemover] = useState(null);
  const [aRedefinir, setARedefinir] = useState(null);
  const [rascunhoAlterado, setRascunhoAlterado] = useState(false);
  const [selecaoPendente, setSelecaoPendente] = useState(null);

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
      const recebidos = await api.usuarios();
      setUsuarios(recebidos);
      setSelecionado((atual) =>
        recebidos.some((usuario) => usuario.login === atual) ? atual : (recebidos[0]?.login ?? null)
      );
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

  const executar = (promessa) =>
    promessa
      .then(recarregar)
      .then(() => true)
      .catch((falha) => {
        setErro(falha.message);
        return false;
      });

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo
    ? usuarios.filter(
        (usuario) =>
          usuario.nome.toLowerCase().includes(termo) || usuario.login.toLowerCase().includes(termo)
      )
    : usuarios;

  const semPermissao = usuarios.filter((usuario) => !usuario.admin && !usuario.acessos.length).length;
  const semSenhaDoPortal = usuarios.filter((usuario) => usuario.semSenhaDoPortal);
  const jaTem = useMemo(() => new Set(usuarios.map((usuario) => usuario.login)), [usuarios]);

  // Deriva quem está aberto à direita em vez de sincronizar com um efeito: se
  // a escolha atual some do filtro (ou ainda não existe), cai no primeiro
  // visível sem precisar de um estado próprio para isso.
  const usuarioSelecionado =
    usuarios.find((usuario) => usuario.login === selecionado) ?? visiveis[0] ?? null;

  function escolherUsuario(login) {
    if (login === usuarioSelecionado?.login) return;
    if (rascunhoAlterado) {
      setSelecaoPendente(login);
      return;
    }
    setSelecionado(login);
  }

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
        acao={
          <Botao onClick={() => setAdicionando(true)}>
            <Icone nome="plus" tamanho={18} />
            Adicionar usuário
          </Botao>
        }
      />

      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={recarregar} /> : null}

      {/* Enquanto alguém está com a senha padrão, a conta dele está aberta a
          quem souber a padrão. Fica no topo, junto com o outro aviso, para ser
          cobrado em vez de ficar aberto em silêncio. */}
      {semSenhaDoPortal.length ? (
        <p className="modulo-aviso">
          <Icone nome="chave" tamanho={16} />
          <span>
            {semSenhaDoPortal.length === 1
              ? `${semSenhaDoPortal[0].nome} ainda não entrou`
              : `${semSenhaDoPortal.length} usuários ainda não entraram`}
            {" "}no portal. No primeiro acesso {semSenhaDoPortal.length === 1 ? "ele usa" : "eles usam"}{" "}
            a senha da rede e {semSenhaDoPortal.length === 1 ? "define a" : "definem as"} deste portal.
          </span>
        </p>
      ) : null}

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

      {!usuarios.length ? (
        <p className="sem-contas">
          Nenhum usuário com acesso ainda. Use “Adicionar usuário” para buscar no Active Directory.
        </p>
      ) : (
        <div className="usuarios-master-detalhe">
          <aside className="usuarios-coluna">
            <div className="usuarios-coluna__topo">
              <label className="usuarios-busca">
                <Icone nome="search" tamanho={16} />
                <input
                  value={filtro}
                  onChange={(evento) => setFiltro(evento.target.value)}
                  placeholder="Buscar por nome ou login…"
                  aria-label="Buscar usuário"
                />
              </label>
              <span className="usuarios-topo__contagem">
                {visiveis.length} de {usuarios.length}
              </span>
            </div>

            <nav className="usuarios-lista" aria-label="Usuários">
              {visiveis.map((usuario) => {
                const status = statusUsuario(usuario);
                return (
                  <button
                    type="button"
                    key={usuario.login}
                    className={`selecao-item usuario-linha ${usuarioSelecionado?.login === usuario.login ? "is-active" : ""}`}
                    title={resumirAcessos(usuario, catalogos)}
                    onClick={() => escolherUsuario(usuario.login)}
                  >
                    <span className="usuario-linha__quem">
                      <span className="avatar-usuario">{iniciais(usuario.nome) ?? "?"}</span>
                      <span className="usuario-linha__texto">
                        <strong>{usuario.nome}</strong>
                        <code>{usuario.login}</code>
                      </span>
                    </span>
                    {status ? <span className={`chip ${status.classe}`}>{status.texto}</span> : null}
                  </button>
                );
              })}

              {!visiveis.length ? (
                <p className="sem-contas">Nenhum usuário corresponde à busca.</p>
              ) : null}
            </nav>
          </aside>

          <section className="usuarios-detalhe">
            {usuarioSelecionado ? (
              <UsuarioDetalhe
                usuario={usuarioSelecionado}
                euMesmo={usuarioSelecionado.login === sessao?.login}
                catalogos={catalogos}
                onAlternarAdmin={() =>
                  executar(
                    api.alterarUsuario(usuarioSelecionado.login, { admin: !usuarioSelecionado.admin })
                  )
                }
                onRedefinirSenha={() => setARedefinir(usuarioSelecionado)}
                onRemover={() => setARemover(usuarioSelecionado)}
                onSalvarPermissao={(lista) => executar(api.definirAcessos(usuarioSelecionado.login, lista))}
                onAlteracao={setRascunhoAlterado}
                temAlteracoes={rascunhoAlterado}
              />
            ) : null}
          </section>
        </div>
      )}

      {adicionando ? (
        <Modal titulo="Adicionar usuário" onFechar={() => setAdicionando(false)} largura="560px">
          <div className="modal__conteudo">
            <BuscaNoAd
              jaTem={jaTem}
              onAdicionar={async (usuario) => {
                const adicionado = await executar(api.darAcesso(usuario));
                if (adicionado) {
                  setSelecionado(usuario.login);
                  setAdicionando(false);
                }
                return adicionado;
              }}
            />
          </div>
        </Modal>
      ) : null}

      {selecaoPendente ? (
        <ModalConfirmacao
          titulo="Descartar alterações?"
          icone="info"
          perigo={false}
          rotuloConfirmar="Descartar e trocar"
          mensagem={
            <>
              As alterações de <strong>{usuarioSelecionado?.nome}</strong> ainda não foram salvas.
              Se você trocar de usuário agora, esse rascunho será perdido.
            </>
          }
          onConfirmar={() => {
            setRascunhoAlterado(false);
            setSelecionado(selecaoPendente);
            setSelecaoPendente(null);
          }}
          onFechar={() => setSelecaoPendente(null)}
        />
      ) : null}

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

      {aRedefinir ? (
        <ModalConfirmacao
          titulo="Redefinir senha do portal"
          rotuloConfirmar="Redefinir senha"
          mensagem={
            <>
              A senha de <strong>{aRedefinir.nome}</strong> no portal é apagada e as sessões
              abertas caem na hora. Ele volta a entrar com a senha da rede e define outra no
              acesso seguinte — você não precisa entregar senha nenhuma.
            </>
          }
          onConfirmar={() => {
            const alvo = aRedefinir;
            setARedefinir(null);
            executar(api.redefinirSenha(alvo.login));
          }}
          onFechar={() => setARedefinir(null)}
        />
      ) : null}
    </main>
  );
}
