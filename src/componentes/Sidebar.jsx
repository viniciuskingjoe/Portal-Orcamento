import Icone from "./Icone.jsx";
import { iniciais } from "../lib/formato.js";

function ItemNav({ id, titulo, icone, badge, ativo, onNavegar }) {
  return (
    <button
      type="button"
      className={`nav-item ${ativo ? "is-active" : ""}`}
      aria-current={ativo ? "page" : undefined}
      onClick={() => onNavegar(id)}
    >
      <Icone nome={icone} tamanho={18} />
      <span>{titulo}</span>
      {badge != null ? <b className="nav-badge">{badge}</b> : null}
    </button>
  );
}

export default function Sidebar({
  empresa,
  // Fica `undefined` enquanto o ERP não respondeu: um badge "0" pareceria dado
  // real, como se o ERP não tivesse filial nenhuma.
  badgeConfiguracoes,
  tela,
  onNavegar,
  tema,
  onAlternarTema,
  sessao,
  onSair,
  onTrocarSenha,
}) {
  return (
    <aside className="sidebar">
      <div className="marca">
        <strong>AKR</strong>
        <span className="marca__divisor" />
        <span className="marca__sufixo">BRANDS</span>
      </div>

      <div className="produto">
        <span className="produto__icone">
          <Icone nome="wallet" tamanho={19} />
        </span>
        <span className="produto__texto">
          <strong>Planejamento</strong>
          <small>Orçamentário</small>
        </span>
      </div>

      <nav className="nav" aria-label="Navegação principal">
        <ItemNav
          id="planos"
          titulo="Planos Orçamentários"
          icone="folder"
          ativo={tela === "planos"}
          onNavegar={onNavegar}
        />
        <ItemNav
          id="visoes"
          titulo="Visões"
          icone="eye"
          ativo={tela === "visoes" || tela === "visao" || tela === "visao-modulo"}
          onNavegar={onNavegar}
        />
        {/* Configurações é global: filiais e centros de custo valem para todos
            os planos, então a tela fica fora de qualquer plano. */}
        <ItemNav
          id="configuracoes"
          titulo="Configurações"
          icone="settings"
          badge={badgeConfiguracoes}
          ativo={tela === "configuracoes" || tela === "filiais" || tela === "centros"}
          onNavegar={onNavegar}
        />
        {/* Só admin: quem não administra não precisa saber que a tela existe. */}
        {sessao?.admin ? (
          <ItemNav
            id="usuarios"
            titulo="Usuários"
            icone="users"
            ativo={tela === "usuarios"}
            onNavegar={onNavegar}
          />
        ) : null}

      </nav>

      <div className="sidebar__rodape">
        <button
          type="button"
          className="tema-toggle"
          onClick={onAlternarTema}
          aria-label={tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        >
          <Icone nome={tema === "dark" ? "sun" : "moon"} tamanho={17} />
          <span>{tema === "dark" ? "Tema claro" : "Tema escuro"}</span>
        </button>

        {/* Sem sessão o rodapé identifica a empresa em vez de simular login. */}
        <div className="card-usuario">
          <span className="card-usuario__avatar">{iniciais(sessao?.nome) ?? "KJ"}</span>
          <span className="card-usuario__texto">
            <strong>{sessao?.nome ?? empresa}</strong>
            <small>{sessao ? (sessao.admin ? "Administrador" : empresa) : "Sessão local"}</small>
          </span>
          {sessao ? (
            <button
              type="button"
              className="botao-sair botao-sair--neutro"
              onClick={onTrocarSenha}
              title="Trocar senha"
              aria-label="Trocar senha"
            >
              <Icone nome="chave" tamanho={16} />
            </button>
          ) : null}
          {sessao ? (
            <button
              type="button"
              className="botao-sair"
              onClick={onSair}
              title="Sair"
              aria-label="Sair"
            >
              <Icone nome="logout" tamanho={16} />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
