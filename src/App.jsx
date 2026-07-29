import { useEffect, useMemo, useState } from "react";

import Sidebar from "./componentes/Sidebar.jsx";
import DrawerNovoPlano from "./componentes/DrawerNovoPlano.jsx";
import ModalDimensao from "./componentes/ModalDimensao.jsx";
import ModalConfirmacao from "./componentes/ModalConfirmacao.jsx";

import TelaPlanos from "./telas/TelaPlanos.jsx";
import TelaHome from "./telas/TelaHome.jsx";
import TelaCrud from "./telas/TelaCrud.jsx";
import TelaVinculos from "./telas/TelaVinculos.jsx";
import TelaOrcamento from "./telas/TelaOrcamento.jsx";
import TelaDeducao from "./telas/TelaDeducao.jsx";

import { EMPRESA } from "./dados/seeds.js";
import {
  campoDaDimensao,
  canaisVisiveis,
  chavePercentual,
  chavePlanejado,
  criarLinhasDeducao,
  criarLinhasOrcamento,
  criarPlano,
  gerarId,
  removerDimensao,
} from "./dados/plano.js";
import { carregarPlanos, salvarPlanos } from "./lib/persistencia.js";
import { formatarParaEdicao, parseNumeroPtBr } from "./lib/formato.js";
import { aplicarTema, temaInicial } from "./lib/tema.js";

const FILTROS_PADRAO = {
  filial: "total",
  canal: "total",
  deducao: "total",
  ano: 2026,
  ocultarSemValores: true,
  aba: "percentual",
};

const TELAS_CRUD = new Set(["filiais", "centros"]);
const TELAS_VINCULO = new Set(["canais", "deducao"]);
const TELAS_ORCAMENTO = new Set(["vendas", "operacionais"]);

export default function PlanejamentoOrcamentario() {
  const [planos, setPlanos] = useState(carregarPlanos);
  const [tela, setTela] = useState("planos");
  const [planoAtivoId, setPlanoAtivoId] = useState(null);
  const [tema, setTema] = useState(temaInicial);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [novoPlano, setNovoPlano] = useState({ nome: "", inicio: "2024", fim: "2026" });
  const [erroPlano, setErroPlano] = useState("");

  const [modal, setModal] = useState(null);
  const [modalNome, setModalNome] = useState("");
  const [modalContas, setModalContas] = useState([]);
  const [confirmacao, setConfirmacao] = useState(null);

  const [filtros, setFiltros] = useState(FILTROS_PADRAO);
  const [editingCell, setEditingCell] = useState(null);
  const [avisoPersistencia, setAvisoPersistencia] = useState("");

  const planoAtivo = useMemo(
    () => planos.find((plano) => plano.id === planoAtivoId) ?? null,
    [planos, planoAtivoId]
  );

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  useEffect(() => {
    const resultado = salvarPlanos(planos);
    setAvisoPersistencia(
      resultado.ok
        ? ""
        : "Não foi possível salvar os planos neste navegador. As alterações valem só para esta sessão."
    );
  }, [planos]);

  const linhasOrcamento = useMemo(() => {
    if (!planoAtivo || !TELAS_ORCAMENTO.has(tela)) return [];
    return criarLinhasOrcamento(planoAtivo, tela, filtros.filial, filtros.canal, filtros.ano);
  }, [planoAtivo, tela, filtros.filial, filtros.canal, filtros.ano]);

  const linhasDeducao = useMemo(() => {
    if (!planoAtivo || tela !== "deducaoVendas") return [];
    return criarLinhasDeducao(
      planoAtivo,
      filtros.filial,
      filtros.canal,
      filtros.deducao,
      filtros.ano,
      filtros.aba
    );
  }, [planoAtivo, tela, filtros.filial, filtros.canal, filtros.deducao, filtros.ano, filtros.aba]);

  const canaisDaLateral = useMemo(() => {
    if (!planoAtivo) return [];
    const modulo = tela === "operacionais" ? "operacionais" : "vendas";
    return canaisVisiveis(planoAtivo, modulo, filtros.filial, filtros.ano, filtros.ocultarSemValores);
  }, [planoAtivo, tela, filtros.filial, filtros.ano, filtros.ocultarSemValores]);

  // --------------------------------------------------------------------------
  // Navegação e filtros
  // --------------------------------------------------------------------------

  // Toda troca de filtro passa por aqui e descarta a edição em curso. Antes cada
  // <select> tratava isso por conta própria e alguns esqueciam, deixando o valor
  // ser gravado na combinação errada de filial/canal/ano.
  function alterarFiltro(alteracoes) {
    setEditingCell(null);
    setFiltros((atuais) => ({ ...atuais, ...alteracoes }));
  }

  function irParaTopo() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function abrirPlano(id) {
    const plano = planos.find((item) => item.id === id);
    setPlanoAtivoId(id);
    setTela("home");
    setFiltros({ ...FILTROS_PADRAO, ano: plano?.fim ?? FILTROS_PADRAO.ano });
    setEditingCell(null);
    irParaTopo();
  }

  function abrirModulo(modulo) {
    setTela(modulo);
    setFiltros((atuais) => ({ ...FILTROS_PADRAO, ano: atuais.ano }));
    setEditingCell(null);
    irParaTopo();
  }

  function navegar(destino) {
    if (destino === "planos") {
      setTela("planos");
      setPlanoAtivoId(null);
      setEditingCell(null);
      irParaTopo();
      return;
    }
    if (destino === "home") {
      setTela("home");
      setEditingCell(null);
      irParaTopo();
      return;
    }
    abrirModulo(destino);
  }

  function voltar() {
    navegar(tela === "home" ? "planos" : "home");
  }

  // --------------------------------------------------------------------------
  // Planos
  // --------------------------------------------------------------------------

  function atualizarPlanoAtivo(transformar) {
    setPlanos((atuais) =>
      atuais.map((plano) => (plano.id === planoAtivoId ? transformar(plano) : plano))
    );
  }

  function salvarNovoPlano() {
    const inicio = Number(novoPlano.inicio);
    const fim = Number(novoPlano.fim);
    if (!novoPlano.nome.trim()) {
      setErroPlano("Informe um nome para o plano.");
      return;
    }
    if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 2000 || fim < inicio) {
      setErroPlano("Informe um período válido.");
      return;
    }
    setPlanos((atuais) => [...atuais, criarPlano(gerarId("plano"), novoPlano.nome.trim(), inicio, fim)]);
    setNovoPlano({ nome: "", inicio: "2024", fim: "2026" });
    setErroPlano("");
    setDrawerAberto(false);
  }

  function confirmarExclusao() {
    if (!confirmacao) return;
    if (confirmacao.tipo === "plano") {
      setPlanos((atuais) => atuais.filter((plano) => plano.id !== confirmacao.id));
      if (confirmacao.id === planoAtivoId) navegar("planos");
    } else {
      atualizarPlanoAtivo((plano) => removerDimensao(plano, confirmacao.tipo, confirmacao.id));
      if (filtros.canal === confirmacao.id) alterarFiltro({ canal: "total" });
      if (filtros.filial === confirmacao.id) alterarFiltro({ filial: "total" });
      if (filtros.deducao === confirmacao.id) alterarFiltro({ deducao: "total" });
    }
    setConfirmacao(null);
  }

  // --------------------------------------------------------------------------
  // Dimensões (filiais, centros, canais, deduções)
  // --------------------------------------------------------------------------

  function abrirModalDimensao(tipo, item = null) {
    setModal({ tipo, id: item?.id ?? null });
    setModalNome(item?.nome ?? "");
    setModalContas(item?.contas ? [...item.contas] : []);
  }

  function salvarDimensao() {
    const nome = modalNome.trim();
    const campo = campoDaDimensao(modal?.tipo);
    if (!nome || !planoAtivo || !campo) return;

    const vinculaContas = modal.tipo === "canais" || modal.tipo === "deducao";

    atualizarPlanoAtivo((plano) => {
      const lista = plano[campo];

      if (modal.id) {
        return {
          ...plano,
          [campo]: lista.map((item) =>
            item.id === modal.id
              ? { ...item, nome, ...(vinculaContas ? { contas: [...modalContas] } : {}) }
              : item
          ),
        };
      }

      // Dimensão criada na tela nasce com os parâmetros do mock zerados e com
      // `manual: true`. Zerado mantém planejado e realizado coerentes; a marca
      // impede que o filtro "ocultar canais sem valores" a esconda logo após o
      // cadastro.
      const novo = {
        id: gerarId(modal.tipo),
        nome,
        manual: true,
        ...(modal.tipo === "filiais" ? { fator: 0 } : {}),
        ...(modal.tipo === "canais"
          ? { contas: [...modalContas], bases: { vendas: 0, operacionais: 0 } }
          : {}),
        ...(modal.tipo === "deducao" ? { contas: [...modalContas], percentualBase: 0 } : {}),
      };

      return { ...plano, [campo]: [...lista, novo] };
    });

    setModal(null);
  }

  // --------------------------------------------------------------------------
  // Edição de células
  // --------------------------------------------------------------------------

  const edicao = {
    editingCell,
    onIniciarEdicao: (id, valor, mes) => setEditingCell({ id, mes, valor: formatarParaEdicao(valor) }),
    onAlterarEdicao: (valor) => setEditingCell((atual) => (atual ? { ...atual, valor } : atual)),
    onCancelarEdicao: () => setEditingCell(null),
    onConfirmarEdicao: () => {
      if (!editingCell || !planoAtivo) return;
      const digitado = parseNumeroPtBr(editingCell.valor);

      if (tela === "deducaoVendas") {
        const valor = Math.max(0, Math.min(100, digitado));
        const chave = chavePercentual(
          filtros.filial,
          filtros.canal,
          filtros.deducao,
          filtros.ano,
          editingCell.mes
        );
        atualizarPlanoAtivo((plano) => ({
          ...plano,
          pctPlanejado: { ...plano.pctPlanejado, [chave]: valor },
        }));
      } else {
        const valor = Math.max(0, digitado);
        const chave = chavePlanejado(tela, filtros.filial, filtros.canal, filtros.ano, editingCell.mes);
        atualizarPlanoAtivo((plano) => ({
          ...plano,
          planejado: { ...plano.planejado, [chave]: valor },
        }));
      }

      setEditingCell(null);
    },
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const pedirExclusao = (tipo) => (item) =>
    setConfirmacao({ tipo, id: item.id, nome: item.nome });

  function renderizarTela() {
    if (tela === "planos" || !planoAtivo) {
      return (
        <TelaPlanos
          planos={planos}
          onAbrir={abrirPlano}
          onNovo={() => setDrawerAberto(true)}
          onExcluir={pedirExclusao("plano")}
        />
      );
    }
    if (tela === "home") {
      return <TelaHome plano={planoAtivo} onAbrirModulo={abrirModulo} onVoltar={voltar} />;
    }
    if (TELAS_CRUD.has(tela)) {
      return (
        <TelaCrud
          tela={tela}
          lista={planoAtivo[campoDaDimensao(tela)]}
          onAdicionar={() => abrirModalDimensao(tela)}
          onEditar={(item) => abrirModalDimensao(tela, item)}
          onExcluir={pedirExclusao(tela)}
          onVoltar={voltar}
        />
      );
    }
    if (TELAS_VINCULO.has(tela)) {
      return (
        <TelaVinculos
          tela={tela}
          lista={planoAtivo[campoDaDimensao(tela)]}
          onAdicionar={() => abrirModalDimensao(tela)}
          onEditar={(item) => abrirModalDimensao(tela, item)}
          onExcluir={pedirExclusao(tela)}
          onVoltar={voltar}
        />
      );
    }
    if (TELAS_ORCAMENTO.has(tela)) {
      return (
        <TelaOrcamento
          plano={planoAtivo}
          modulo={tela}
          filtros={filtros}
          onAlterarFiltro={alterarFiltro}
          canais={canaisDaLateral}
          linhas={linhasOrcamento}
          edicao={edicao}
          onVoltar={voltar}
        />
      );
    }
    return (
      <TelaDeducao
        plano={planoAtivo}
        filtros={filtros}
        onAlterarFiltro={alterarFiltro}
        canais={canaisDaLateral}
        linhas={linhasDeducao}
        edicao={edicao}
        onVoltar={voltar}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        empresa={EMPRESA}
        planoAtivo={planoAtivo}
        tela={tela}
        onNavegar={navegar}
        tema={tema}
        onAlternarTema={() => setTema((atual) => (atual === "dark" ? "light" : "dark"))}
      />

      <div className="area-conteudo">
        {avisoPersistencia ? (
          <p className="aviso-fixo" role="status">
            {avisoPersistencia}
          </p>
        ) : null}
        {renderizarTela()}
      </div>

      {drawerAberto ? (
        <DrawerNovoPlano
          valores={novoPlano}
          erro={erroPlano}
          onAlterar={(alteracoes) => {
            setNovoPlano((atual) => ({ ...atual, ...alteracoes }));
            setErroPlano("");
          }}
          onSalvar={salvarNovoPlano}
          onFechar={() => {
            setDrawerAberto(false);
            setErroPlano("");
          }}
        />
      ) : null}

      {modal ? (
        <ModalDimensao
          modal={modal}
          nome={modalNome}
          contas={modalContas}
          onAlterarNome={setModalNome}
          onAlterarContas={setModalContas}
          onSalvar={salvarDimensao}
          onFechar={() => setModal(null)}
        />
      ) : null}

      {confirmacao ? (
        <ModalConfirmacao
          nome={confirmacao.nome}
          descricao={
            confirmacao.tipo === "plano"
              ? "O plano e todos os valores digitados nele serão removidos."
              : "Esta ação afeta apenas este plano orçamentário."
          }
          onConfirmar={confirmarExclusao}
          onFechar={() => setConfirmacao(null)}
        />
      ) : null}
    </div>
  );
}
