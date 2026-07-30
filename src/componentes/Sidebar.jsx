import Icone from "./Icone.jsx";
import { modulosDaVisao } from "../dados/visao.js";

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
  configuracao,
  planoAtivo,
  visaoDoPlano,
  tela,
  onNavegar,
  tema,
  onAlternarTema,
}) {
  const modulos = visaoDoPlano ? modulosDaVisao(visaoDoPlano) : [];
  const totalDeConfiguracoes = configuracao.filiais.length + configuracao.centros.length;

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
          badge={totalDeConfiguracoes}
          ativo={tela === "configuracoes" || tela === "filiais" || tela === "centros"}
          onNavegar={onNavegar}
        />

        {planoAtivo ? (
          <>
            <div className="nav-grupo">
              <span className="nav-grupo__titulo">{planoAtivo.nome}</span>
              <ItemNav
                id="home"
                titulo="Visão geral"
                icone="calendar"
                ativo={tela === "home"}
                onNavegar={onNavegar}
              />
            </div>

            <div className="nav-grupo">
              <span className="nav-grupo__titulo">
                Orçamentos{visaoDoPlano ? ` · ${visaoDoPlano.nome}` : ""}
              </span>
              {modulos.length ? (
                modulos.map((modulo) => (
                  <ItemNav
                    key={modulo.id}
                    id={modulo.id}
                    titulo={modulo.titulo}
                    icone={modulo.icone}
                    ativo={tela === modulo.id}
                    onNavegar={onNavegar}
                  />
                ))
              ) : (
                <p className="nav-aviso">
                  {visaoDoPlano
                    ? "Nenhum módulo configurado nesta visão."
                    : "Este plano não tem visão associada."}
                </p>
              )}
            </div>
          </>
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
