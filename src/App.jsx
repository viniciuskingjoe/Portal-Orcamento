import { useEffect, useMemo, useState } from "react";

import Sidebar from "./componentes/Sidebar.jsx";
import DrawerNovoPlano from "./componentes/DrawerNovoPlano.jsx";
import ModalNome from "./componentes/ModalNome.jsx";
import ModalConfirmacao from "./componentes/ModalConfirmacao.jsx";

import TelaPlanos from "./telas/TelaPlanos.jsx";
import TelaHome from "./telas/TelaHome.jsx";
import TelaConfiguracoes from "./telas/TelaConfiguracoes.jsx";
import TelaCrud from "./telas/TelaCrud.jsx";
import TelaVisoes from "./telas/TelaVisoes.jsx";
import TelaVisao from "./telas/TelaVisao.jsx";
import TelaVisaoModulo from "./telas/TelaVisaoModulo.jsx";
import TelaOrcamento from "./telas/TelaOrcamento.jsx";

import { EMPRESA } from "./dados/seeds.js";
import { ehModulo, modulo as definicaoDoModulo } from "./dados/modulos.js";
import {
  adicionarItem,
  campoDaDimensao,
  removerItem,
  renomearItem,
} from "./dados/configuracao.js";
import {
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  gerarId,
  purgarFilialDosPlanos,
} from "./dados/plano.js";
import { criarVisao, definirContasDoModulo } from "./dados/visao.js";
import { carregarEstado, salvarEstado } from "./lib/persistencia.js";
import { formatarParaEdicao, parseNumeroPtBr } from "./lib/formato.js";
import { aplicarTema, temaInicial } from "./lib/tema.js";

const FILTROS_PADRAO = { filial: "total", ano: 2026 };
const TELAS_CRUD = new Set(["filiais", "centros"]);

export default function PlanejamentoOrcamentario() {
  const inicial = useMemo(carregarEstado, []);

  const [configuracao, setConfiguracao] = useState(inicial.configuracao);
  const [visoes, setVisoes] = useState(inicial.visoes);
  const [planos, setPlanos] = useState(inicial.planos);

  const [tela, setTela] = useState("planos");
  const [planoAtivoId, setPlanoAtivoId] = useState(null);
  const [visaoAbertaId, setVisaoAbertaId] = useState(null);
  const [moduloAbertoId, setModuloAbertoId] = useState(null);
  const [tema, setTema] = useState(temaInicial);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [novoPlano, setNovoPlano] = useState({ nome: "", inicio: "2024", fim: "2026", visaoId: null });
  const [erroPlano, setErroPlano] = useState("");

  const [modalDimensao, setModalDimensao] = useState(null);
  const [modalVisao, setModalVisao] = useState(null);
  const [modalNome, setModalNome] = useState("");
  const [confirmacao, setConfirmacao] = useState(null);

  const [filtros, setFiltros] = useState(FILTROS_PADRAO);
  const [editingCell, setEditingCell] = useState(null);
  const [avisoPersistencia, setAvisoPersistencia] = useState("");

  const planoAtivo = useMemo(
    () => planos.find((plano) => plano.id === planoAtivoId) ?? null,
    [planos, planoAtivoId]
  );

  const visaoDoPlano = useMemo(
    () => visoes.find((visao) => visao.id === planoAtivo?.visaoId) ?? null,
    [visoes, planoAtivo]
  );

  const visaoAberta = useMemo(
    () => visoes.find((visao) => visao.id === visaoAbertaId) ?? null,
    [visoes, visaoAbertaId]
  );

  const moduloDaTela = ehModulo(tela) ? definicaoDoModulo(tela) : null;

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  useEffect(() => {
    const resultado = salvarEstado({ configuracao, visoes, planos });
    setAvisoPersistencia(
      resultado.ok
        ? ""
        : "Não foi possível salvar neste navegador. As alterações valem só para esta sessão."
    );
  }, [configuracao, visoes, planos]);

  const linhasOrcamento = useMemo(() => {
    if (!planoAtivo || !moduloDaTela) return [];
    return criarLinhasOrcamento({
      plano: planoAtivo,
      visao: visaoDoPlano,
      filiais: configuracao.filiais,
      moduloId: moduloDaTela.id,
      filialId: filtros.filial,
      ano: filtros.ano,
    });
  }, [planoAtivo, visaoDoPlano, configuracao.filiais, moduloDaTela, filtros.filial, filtros.ano]);

  // --------------------------------------------------------------------------
  // Navegação
  // --------------------------------------------------------------------------

  function irParaTopo() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  // Toda troca de filtro descarta a edição em curso: sem isso o valor digitado
  // poderia ser gravado na combinação errada de filial/ano.
  function alterarFiltro(alteracoes) {
    setEditingCell(null);
    setFiltros((atuais) => ({ ...atuais, ...alteracoes }));
  }

  function abrirPlano(id) {
    const plano = planos.find((item) => item.id === id);
    setPlanoAtivoId(id);
    setTela("home");
    setFiltros({ ...FILTROS_PADRAO, ano: plano?.fim ?? FILTROS_PADRAO.ano });
    setEditingCell(null);
    irParaTopo();
  }

  function abrirModulo(moduloId) {
    setTela(moduloId);
    setFiltros((atuais) => ({ ...FILTROS_PADRAO, ano: atuais.ano }));
    setEditingCell(null);
    irParaTopo();
  }

  function abrirVisao(id) {
    setVisaoAbertaId(id);
    setModuloAbertoId(null);
    setTela("visao");
    irParaTopo();
  }

  function abrirModuloDaVisao(moduloId) {
    setModuloAbertoId(moduloId);
    setTela("visao-modulo");
    irParaTopo();
  }

  function navegar(destino) {
    setEditingCell(null);
    if (destino === "planos") {
      setPlanoAtivoId(null);
      setTela("planos");
    } else if (destino === "visoes") {
      setVisaoAbertaId(null);
      setModuloAbertoId(null);
      setTela("visoes");
    } else if (ehModulo(destino)) {
      abrirModulo(destino);
      return;
    } else {
      setTela(destino);
    }
    irParaTopo();
  }

  function voltar() {
    if (tela === "visao-modulo") return navegar("visao");
    if (tela === "visao") return navegar("visoes");
    if (TELAS_CRUD.has(tela)) return navegar("configuracoes");
    if (moduloDaTela) return navegar("home");
    return navegar("planos");
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
    if (!novoPlano.visaoId) {
      setErroPlano("Selecione a visão que este plano vai orçar.");
      return;
    }
    if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 2000 || fim < inicio) {
      setErroPlano("Informe um período válido.");
      return;
    }
    setPlanos((atuais) => [
      ...atuais,
      criarPlano(gerarId("plano"), novoPlano.nome.trim(), inicio, fim, novoPlano.visaoId),
    ]);
    setNovoPlano({ nome: "", inicio: "2024", fim: "2026", visaoId: null });
    setErroPlano("");
    setDrawerAberto(false);
  }

  // --------------------------------------------------------------------------
  // Visões
  // --------------------------------------------------------------------------

  function abrirModalVisao(visao = null) {
    setModalVisao({ id: visao?.id ?? null });
    setModalNome(visao?.nome ?? "");
  }

  function salvarVisao() {
    const nome = modalNome.trim();
    if (!nome) return;

    if (modalVisao.id) {
      setVisoes((atuais) =>
        atuais.map((visao) => (visao.id === modalVisao.id ? { ...visao, nome } : visao))
      );
    } else {
      const nova = criarVisao(gerarId("visao"), nome);
      setVisoes((atuais) => [...atuais, nova]);
      setVisaoAbertaId(nova.id);
      setTela("visao");
      irParaTopo();
    }
    setModalVisao(null);
  }

  function alterarContasDoModulo(visaoId, moduloId, contasIds) {
    setVisoes((atuais) =>
      atuais.map((visao) =>
        visao.id === visaoId ? definirContasDoModulo(visao, moduloId, contasIds) : visao
      )
    );
  }

  // --------------------------------------------------------------------------
  // Configuração global (filiais, centros de custo)
  // --------------------------------------------------------------------------

  function abrirModalDimensao(tipo, item = null) {
    setModalDimensao({ tipo, id: item?.id ?? null });
    setModalNome(item?.nome ?? "");
  }

  function salvarDimensao() {
    const nome = modalNome.trim();
    const tipo = modalDimensao?.tipo;
    if (!nome || !campoDaDimensao(tipo)) return;

    if (modalDimensao.id) {
      setConfiguracao((atual) => renomearItem(atual, tipo, modalDimensao.id, nome));
    } else {
      // Filial criada na tela nasce com o parâmetro do mock zerado, o que mantém
      // planejado e realizado coerentes (ambos zero).
      const novo = {
        id: gerarId(tipo),
        nome,
        manual: true,
        ...(tipo === "filiais" ? { fator: 0 } : {}),
      };
      setConfiguracao((atual) => adicionarItem(atual, tipo, novo));
    }

    setModalDimensao(null);
  }

  // --------------------------------------------------------------------------
  // Exclusões
  // --------------------------------------------------------------------------

  const pedirExclusao = (tipo) => (item) =>
    setConfirmacao({ tipo, id: item.id, nome: item.nome });

  function descricaoDaConfirmacao() {
    if (confirmacao?.tipo === "plano") {
      return "O plano e todos os valores digitados nele serão removidos.";
    }
    if (confirmacao?.tipo === "visao") {
      const emUso = planos.filter((plano) => plano.visaoId === confirmacao.id).length;
      return emUso
        ? `${emUso} ${emUso === 1 ? "plano usa" : "planos usam"} esta visão e ${
            emUso === 1 ? "ficará" : "ficarão"
          } sem módulos de orçamento.`
        : "Nenhum plano usa esta visão.";
    }
    if (confirmacao?.tipo === "filiais") {
      return "A filial é global: os valores digitados para ela serão removidos de TODOS os planos.";
    }
    if (confirmacao?.tipo === "centros") {
      return "O centro de custo sai da configuração do portal.";
    }
    return "Esta ação não pode ser desfeita.";
  }

  function confirmarExclusao() {
    if (!confirmacao) return;

    if (confirmacao.tipo === "plano") {
      setPlanos((atuais) => atuais.filter((plano) => plano.id !== confirmacao.id));
      if (confirmacao.id === planoAtivoId) navegar("planos");
    } else if (confirmacao.tipo === "visao") {
      setVisoes((atuais) => atuais.filter((visao) => visao.id !== confirmacao.id));
      if (confirmacao.id === visaoAbertaId) navegar("visoes");
    } else {
      setConfiguracao((atual) => removerItem(atual, confirmacao.tipo, confirmacao.id));
      if (confirmacao.tipo === "filiais") {
        setPlanos((atuais) => purgarFilialDosPlanos(atuais, confirmacao.id));
        if (filtros.filial === confirmacao.id) alterarFiltro({ filial: "total" });
      }
    }

    setConfirmacao(null);
  }

  // --------------------------------------------------------------------------
  // Edição de células
  // --------------------------------------------------------------------------

  const edicao = {
    editingCell,
    onIniciarEdicao: (id, valor, mes) =>
      setEditingCell({ id, mes, valor: formatarParaEdicao(valor) }),
    onAlterarEdicao: (valor) => setEditingCell((atual) => (atual ? { ...atual, valor } : atual)),
    onCancelarEdicao: () => setEditingCell(null),
    onConfirmarEdicao: () => {
      if (!editingCell || !planoAtivo || !moduloDaTela) return;
      const valor = Math.max(0, parseNumeroPtBr(editingCell.valor));
      const chave = chavePlanejado(moduloDaTela.id, filtros.filial, filtros.ano, editingCell.mes);
      atualizarPlanoAtivo((plano) => ({
        ...plano,
        planejado: { ...plano.planejado, [chave]: valor },
      }));
      setEditingCell(null);
    },
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  function renderizarTela() {
    if (tela === "visoes") {
      return (
        <TelaVisoes
          visoes={visoes}
          planos={planos}
          onAbrir={abrirVisao}
          onNova={() => abrirModalVisao()}
          onExcluir={pedirExclusao("visao")}
        />
      );
    }

    if (tela === "visao" && visaoAberta) {
      return (
        <TelaVisao
          visao={visaoAberta}
          onAbrirModulo={abrirModuloDaVisao}
          onRenomear={() => abrirModalVisao(visaoAberta)}
          onVoltar={voltar}
        />
      );
    }

    if (tela === "visao-modulo" && visaoAberta && ehModulo(moduloAbertoId)) {
      return (
        <TelaVisaoModulo
          visao={visaoAberta}
          modulo={definicaoDoModulo(moduloAbertoId)}
          onAlterarContas={(contasIds) =>
            alterarContasDoModulo(visaoAberta.id, moduloAbertoId, contasIds)
          }
          onVoltar={voltar}
        />
      );
    }

    if (tela === "configuracoes") {
      return <TelaConfiguracoes configuracao={configuracao} onAbrir={(id) => navegar(id)} />;
    }

    if (TELAS_CRUD.has(tela)) {
      return (
        <TelaCrud
          tela={tela}
          lista={configuracao[campoDaDimensao(tela)]}
          onAdicionar={() => abrirModalDimensao(tela)}
          onEditar={(item) => abrirModalDimensao(tela, item)}
          onExcluir={pedirExclusao(tela)}
          onVoltar={voltar}
        />
      );
    }

    if (tela === "planos" || !planoAtivo) {
      return (
        <TelaPlanos
          planos={planos}
          visoes={visoes}
          onAbrir={abrirPlano}
          onNovo={() => setDrawerAberto(true)}
          onExcluir={pedirExclusao("plano")}
        />
      );
    }

    if (moduloDaTela && visaoDoPlano) {
      return (
        <TelaOrcamento
          plano={planoAtivo}
          visao={visaoDoPlano}
          filiais={configuracao.filiais}
          modulo={moduloDaTela}
          filtros={filtros}
          onAlterarFiltro={alterarFiltro}
          linhas={linhasOrcamento}
          edicao={edicao}
          onVoltar={voltar}
        />
      );
    }

    return (
      <TelaHome
        plano={planoAtivo}
        visao={visaoDoPlano}
        onAbrirModulo={abrirModulo}
        onVoltar={voltar}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        empresa={EMPRESA}
        configuracao={configuracao}
        planoAtivo={planoAtivo}
        visaoDoPlano={visaoDoPlano}
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
          visoes={visoes}
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

      {modalVisao ? (
        <ModalNome
          titulo={modalVisao.id ? "Renomear visão" : "Criar visão"}
          rotulo="Nome da visão"
          ajuda={
            modalVisao.id
              ? undefined
              : "Depois de criar, selecione as contas de cada módulo. Ex.: DRE 2025."
          }
          valor={modalNome}
          onAlterar={setModalNome}
          onSalvar={salvarVisao}
          onFechar={() => setModalVisao(null)}
        />
      ) : null}

      {modalDimensao ? (
        <ModalNome
          titulo={`${modalDimensao.id ? "Editar" : "Adicionar"} ${
            modalDimensao.tipo === "filiais" ? "filial" : "centro de custo"
          }`}
          valor={modalNome}
          onAlterar={setModalNome}
          onSalvar={salvarDimensao}
          onFechar={() => setModalDimensao(null)}
        />
      ) : null}

      {confirmacao ? (
        <ModalConfirmacao
          nome={confirmacao.nome}
          descricao={descricaoDaConfirmacao()}
          onConfirmar={confirmarExclusao}
          onFechar={() => setConfirmacao(null)}
        />
      ) : null}
    </div>
  );
}
