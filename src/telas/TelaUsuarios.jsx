import { useEffect, useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import Seletor from "../componentes/Seletor.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import { MODULOS } from "../dados/modulos.js";
import { descreverConcessao, resumirAcessos } from "../dados/permissoes.js";
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

const TODOS = "";

// Os três casos que cobrem quase tudo. Montar concessão campo a campo é para a
// exceção, não para o comum.
const ATALHOS = [
  { rotulo: "Acesso total", acesso: { modulo: TODOS, filial: TODOS, centro: TODOS, podeEditar: true } },
  { rotulo: "Somente leitura", acesso: { modulo: TODOS, filial: TODOS, centro: TODOS, podeEditar: false } },
];

function Concessao({ acesso, catalogos, onRevogar }) {
  return (
    <li className="concessao">
      <span className={`chip chip--${acesso.podeEditar ? "receita" : "despesa"}`}>
        {acesso.podeEditar ? "edita" : "só vê"}
      </span>
      <span className="concessao__texto">{descreverConcessao(acesso, catalogos)}</span>
      <button type="button" className="botao-texto" onClick={() => onRevogar(acesso.id)}>
        Remover
      </button>
    </li>
  );
}

function NovaConcessao({ catalogos, onConceder }) {
  const [modulo, setModulo] = useState(TODOS);
  const [filial, setFilial] = useState(TODOS);
  const [centro, setCentro] = useState(TODOS);
  const [podeEditar, setPodeEditar] = useState(true);

  const previa = descreverConcessao({ modulo: modulo || null, filial: filial || null, centro: centro || null }, catalogos);

  function conceder(acesso) {
    onConceder(acesso);
    setModulo(TODOS);
    setFilial(TODOS);
    setCentro(TODOS);
  }

  return (
    <div className="nova-concessao">
      <div className="nova-concessao__atalhos">
        {ATALHOS.map((atalho) => (
          <button
            key={atalho.rotulo}
            type="button"
            className="botao botao--secundario botao--compacto"
            onClick={() => conceder(atalho.acesso)}
          >
            {atalho.rotulo}
          </button>
        ))}
      </div>

      <form
        className="nova-concessao__campos"
        onSubmit={(evento) => {
          evento.preventDefault();
          conceder({ modulo, filial, centro, podeEditar });
        }}
      >
        <label>
          <span>Módulo</span>
          <Seletor
            valor={modulo}
            opcoes={[
              { valor: TODOS, rotulo: "todos os módulos" },
              ...catalogos.modulos.map((item) => ({ valor: item.id, rotulo: item.nome })),
            ]}
            aoEscolher={setModulo}
          />
        </label>

        <label>
          <span>Filial</span>
          <Seletor
            valor={filial}
            opcoes={[
              { valor: TODOS, rotulo: "todas as filiais" },
              ...catalogos.filiais.map((item) => ({ valor: item.id, rotulo: item.nome })),
            ]}
            aoEscolher={setFilial}
            buscaVazia="Nenhuma filial com esse nome."
          />
        </label>

        <label>
          <span>Centro de custo</span>
          <Seletor
            valor={centro}
            opcoes={[
              { valor: TODOS, rotulo: "todos os centros" },
              ...catalogos.centros.map((item) => ({
                valor: item.id,
                rotulo: item.nome,
                detalhe: item.id,
              })),
            ]}
            aoEscolher={setCentro}
            buscaVazia="Nenhum centro com esse nome."
          />
        </label>

        <label className="check-inline">
          <input type="checkbox" checked={podeEditar} onChange={(e) => setPodeEditar(e.target.checked)} />
          <span className="checkbox-visual">
            <Icone nome="check" tamanho={13} />
          </span>
          Pode lançar
        </label>

        <button type="submit" className="botao botao--primario botao--compacto">
          Conceder
        </button>
      </form>

      {/* Prévia: ler três selects e imaginar o resultado é onde se erra. */}
      <p className="nova-concessao__previa">
        Vai conceder: <strong>{podeEditar ? "editar" : "ver"}</strong> {previa}.
      </p>
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
                    onClick={() => executar(api.removerUsuario(usuario.login))}
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

                  <ul className="lista-concessoes">
                    {usuario.acessos.map((acesso) => (
                      <Concessao
                        key={acesso.id}
                        acesso={acesso}
                        catalogos={catalogos}
                        onRevogar={(id) => executar(api.revogarAcesso(usuario.login, id))}
                      />
                    ))}
                  </ul>

                  <NovaConcessao
                    catalogos={catalogos}
                    onConceder={(acesso) => executar(api.concederAcesso(usuario.login, acesso))}
                  />
                </div>
              ) : null}
            </section>
          );
        })}

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
