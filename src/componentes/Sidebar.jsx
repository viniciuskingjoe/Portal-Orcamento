import Icone from "./Icone.jsx";
import { MODULOS, MODULOS_CONFIG, MODULOS_ORCAMENTO } from "../dados/seeds.js";

const CONTAGEM_POR_MODULO = {
  filiais: "filiais",
  centros: "centros",
  canais: "canais",
  deducao: "deducoes",
};

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

export default function Sidebar({ empresa, planoAtivo, tela, onNavegar, tema, onAlternarTema }) {
  const grupos = planoAtivo
    ? [
        { titulo: "Configuração", modulos: MODULOS_CONFIG },
        { titulo: "Orçamentos", modulos: MODULOS_ORCAMENTO },
      ]
    : [];

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
          titulo="Planos"
          icone="folder"
          ativo={tela === "planos"}
          onNavegar={onNavegar}
        />
        {planoAtivo ? (
          <ItemNav
            id="home"
            titulo="Visão geral"
            icone="calendar"
            ativo={tela === "home"}
            onNavegar={onNavegar}
          />
        ) : null}

        {grupos.map((grupo) => (
          <div className="nav-grupo" key={grupo.titulo}>
            <span className="nav-grupo__titulo">{grupo.titulo}</span>
            {grupo.modulos.map((id) => {
              const campo = CONTAGEM_POR_MODULO[id];
              return (
                <ItemNav
                  key={id}
                  id={id}
                  titulo={MODULOS[id].titulo}
                  icone={MODULOS[id].icone}
                  badge={campo ? planoAtivo[campo].length : undefined}
                  ativo={tela === id}
                  onNavegar={onNavegar}
                />
              );
            })}
          </div>
        ))}
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

        {/* O padrão prevê card de usuário com "Sair". Enquanto o portal não tem
            autenticação, o rodapé identifica a empresa em vez de simular login. */}
        <div className="card-usuario">
          <span className="card-usuario__avatar">KJ</span>
          <span className="card-usuario__texto">
            <strong>{empresa}</strong>
            <small>Sessão local · sem autenticação</small>
          </span>
        </div>
      </div>
    </aside>
  );
}
