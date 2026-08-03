import { useEffect, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import { MODULOS } from "../dados/modulos.js";
import { api } from "../lib/api.js";

// ============================================================================
// USUÁRIOS
//
// Quem entra vem do AD; o que a pessoa pode fazer é decidido aqui. As duas
// coisas são separadas de propósito: o AD diz quem existe na empresa, o portal
// diz quem orça o quê.
//
// Cada linha de acesso é uma concessão. "Todos" numa dimensão é o normal —
// restringir é a exceção, e é o que a tela deixa explícito.
// ============================================================================

const TODOS = "";

function Concessao({ acesso, filiais, centros, onRevogar }) {
  const nomeDe = (lista, id, rotulo) =>
    id ? (lista.find((item) => item.id === id)?.nome ?? id) : `todas as ${rotulo}`;

  const modulo = acesso.modulo
    ? (MODULOS.find((m) => m.id === acesso.modulo)?.titulo ?? acesso.modulo)
    : "todos os módulos";

  return (
    <li className="concessao">
      <span className={`chip chip--${acesso.podeEditar ? "receita" : "despesa"}`}>
        {acesso.podeEditar ? "edita" : "só vê"}
      </span>
      <span className="concessao__texto">
        {modulo} · {nomeDe(filiais, acesso.filial, "filiais")} ·{" "}
        {nomeDe(centros, acesso.centro, "centros")}
      </span>
      <button type="button" className="botao-texto" onClick={() => onRevogar(acesso.id)}>
        Remover
      </button>
    </li>
  );
}

function NovaConcessao({ filiais, centros, onConceder }) {
  const [modulo, setModulo] = useState(TODOS);
  const [filial, setFilial] = useState(TODOS);
  const [centro, setCentro] = useState(TODOS);
  const [podeEditar, setPodeEditar] = useState(true);

  return (
    <form
      className="nova-concessao"
      onSubmit={(evento) => {
        evento.preventDefault();
        onConceder({ modulo, filial, centro, podeEditar });
      }}
    >
      <label>
        <span>Módulo</span>
        <select value={modulo} onChange={(e) => setModulo(e.target.value)}>
          <option value={TODOS}>todos</option>
          {MODULOS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.titulo}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Filial</span>
        <select value={filial} onChange={(e) => setFilial(e.target.value)}>
          <option value={TODOS}>todas</option>
          {filiais.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Centro de custo</span>
        <select value={centro} onChange={(e) => setCentro(e.target.value)}>
          <option value={TODOS}>todos</option>
          {centros.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} — {item.nome}
            </option>
          ))}
        </select>
      </label>

      <label className="check-inline">
        <input type="checkbox" checked={podeEditar} onChange={(e) => setPodeEditar(e.target.checked)} />
        <span className="checkbox-visual">
          <Icone nome="check" tamanho={13} />
        </span>
        Pode lançar
      </label>

      <button type="submit" className="botao botao--secundario botao--compacto">
        Conceder
      </button>
    </form>
  );
}

function BuscaNoAd({ onAdicionar }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  // Espera a digitação parar: o AD é consultado a cada busca, e uma consulta
  // por tecla derrubaria o diretório sem precisar.
  useEffect(() => {
    const alvo = termo.trim();
    if (alvo.length < 2) {
      setAchados([]);
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

      {erro ? <p className="sem-contas">{erro}</p> : null}
      {buscando ? <p className="sem-contas">Procurando…</p> : null}

      {achados.map((usuario) => (
        <button
          type="button"
          key={usuario.login}
          className="selecao-item selecao-item--conta"
          onClick={() => {
            onAdicionar(usuario);
            setTermo("");
          }}
        >
          <code>{usuario.login}</code>
          <span>
            {usuario.nome}
            {usuario.email ? ` · ${usuario.email}` : ""}
          </span>
        </button>
      ))}
    </section>
  );
}

export default function TelaUsuarios({ filiais, centros, sessao, onVoltar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);

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

      <BuscaNoAd onAdicionar={(usuario) => executar(api.darAcesso(usuario))} />

      <div className="lista-usuarios">
        {usuarios.map((usuario) => {
          const euMesmo = usuario.login === sessao?.login;
          const expandido = aberto === usuario.login;

          return (
            <section className="cartao-usuario" key={usuario.login}>
              <header>
                <span className="cartao-usuario__nome">
                  <strong>{usuario.nome}</strong>
                  <code>{usuario.login}</code>
                </span>

                <span className="cartao-usuario__marcas">
                  {usuario.admin ? <span className="chip chip--receita">administrador</span> : null}
                  {usuario.situacao !== "ativo" ? (
                    <span className="chip chip--despesa">inativo no portal</span>
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
                    onClick={() => setAberto(expandido ? null : usuario.login)}
                  >
                    {usuario.acessos.length}{" "}
                    {usuario.acessos.length === 1 ? "permissão" : "permissões"}
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
                      Administrador vê e edita tudo — as concessões abaixo não são consultadas.
                    </p>
                  ) : null}

                  <ul className="lista-concessoes">
                    {usuario.acessos.map((acesso) => (
                      <Concessao
                        key={acesso.id}
                        acesso={acesso}
                        filiais={filiais}
                        centros={centros}
                        onRevogar={(id) => executar(api.revogarAcesso(usuario.login, id))}
                      />
                    ))}
                    {!usuario.acessos.length && !usuario.admin ? (
                      <li className="sem-contas">
                        Sem permissão nenhuma: entra no portal e não vê dado algum.
                      </li>
                    ) : null}
                  </ul>

                  <NovaConcessao
                    filiais={filiais}
                    centros={centros}
                    onConceder={(acesso) => executar(api.concederAcesso(usuario.login, acesso))}
                  />
                </div>
              ) : null}
            </section>
          );
        })}

        {!usuarios.length ? (
          <p className="sem-contas">
            Nenhum usuário com acesso ainda. Busque no Active Directory acima para adicionar.
          </p>
        ) : null}
      </div>
    </main>
  );
}
