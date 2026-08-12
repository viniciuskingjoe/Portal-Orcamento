import { useEffect, useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import EditorPermissao from "../componentes/EditorPermissao.jsx";
import ModalConfirmacao from "../componentes/ModalConfirmacao.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import { MODULOS } from "../dados/modulos.js";
import {
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
  const [aRedefinir, setARedefinir] = useState(null);

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
  const semSenhaDoPortal = usuarios.filter((usuario) => usuario.semSenhaDoPortal);
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
                  {usuario.semSenhaDoPortal ? (
                    <span
                      className="chip"
                      title="Nunca entrou. No primeiro acesso usa a senha da rede e define a senha do portal."
                    >
                      1º acesso pendente
                    </span>
                  ) : null}
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

                  {/* Redefinir derruba as sessões abertas da pessoa e obriga
                      troca no próximo acesso — por isso passa por confirmação
                      em vez de agir no clique. */}
                  <button
                    type="button"
                    className="botao-texto"
                    onClick={() => setARedefinir(usuario)}
                  >
                    Apagar senha
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

                  <EditorPermissao
                    usuario={usuario}
                    catalogos={catalogos}
                    onSalvar={(lista) => executar(api.definirAcessos(usuario.login, lista))}
                  />                </div>
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

        {aRedefinir ? (
          <ModalConfirmacao
            titulo="Apagar a senha do portal"
            rotuloConfirmar="Apagar a senha"
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

