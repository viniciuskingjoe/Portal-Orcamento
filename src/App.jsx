import { useEffect, useMemo, useState } from "react";

import Sidebar from "./componentes/Sidebar.jsx";
import DrawerNovoPlano from "./componentes/DrawerNovoPlano.jsx";
import ModalVisao from "./componentes/ModalVisao.jsx";
import ModalConfirmacao from "./componentes/ModalConfirmacao.jsx";
import { AvisoErro, Carregando } from "./componentes/Estados.jsx";

import TelaPlanos from "./telas/TelaPlanos.jsx";
import TelaHome from "./telas/TelaHome.jsx";
import TelaConfiguracoes from "./telas/TelaConfiguracoes.jsx";
import TelaListaErp from "./telas/TelaListaErp.jsx";
import TelaVisoes from "./telas/TelaVisoes.jsx";
import TelaVisao from "./telas/TelaVisao.jsx";
import TelaVisaoModulo from "./telas/TelaVisaoModulo.jsx";
import TelaOrcamento, { TODAS_AS_CONTAS } from "./telas/TelaOrcamento.jsx";

import { EMPRESA } from "./dados/seeds.js";
import { ehModulo, modulo as definicaoDoModulo } from "./dados/modulos.js";
import { chavePlanejado, criarLinhasOrcamento, criarPlano, gerarId } from "./dados/plano.js";
import {
  SEM_CENTRO,
  contasEfetivasDoModulo,
  criarVisao,
  definirContasDaFilial,
  definirContasDoCentro,
  definirUsaCentroDeCusto,
  usaCentroDeCusto,
} from "./dados/visao.js";
import { conta as buscarConta } from "./dados/contas.js";
import { carregarEstado, salvarEstado } from "./lib/persistencia.js";
import { formatarParaEdicao, parseNumeroPtBr } from "./lib/formato.js";
import { aplicarTema, temaInicial } from "./lib/tema.js";
import { useCadastrosDoErp, useContas, useRealizado } from "./lib/useErp.js";

const FILTROS_PADRAO = { filial: "total", centro: SEM_CENTRO, conta: TODAS_AS_CONTAS };
const TELAS_ERP = new Set(["filiais", "centros"]);

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
  const [novoPlano, setNovoPlano] = useState({
    nome: "",
    ano: String(new Date().getFullYear() + 1),
    visaoId: null,
  });
  const [erroPlano, setErroPlano] = useState("");

  const [modalVisao, setModalVisao] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);

  const [filtros, setFiltros] = useState(FILTROS_PADRAO);
  const [editingCell, setEditingCell] = useState(null);
  const [avisoPersistencia, setAvisoPersistencia] = useState("");

  const erp = useCadastrosDoErp();

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

  // Filiais que o portal usa. `null` = ainda não escolhidas, o que vale por todas.
  const filiaisAtivas = useMemo(() => {
    const escolhidas = configuracao.filiaisAtivas;
    if (!escolhidas) return erp.filiais;
    const marcadas = new Set(escolhidas);
    return erp.filiais.filter((filial) => marcadas.has(filial.id));
  }, [erp.filiais, configuracao.filiaisAtivas]);

  // A visão contábil em uso depende de onde se está: montando uma visão ou
  // orçando um plano.
  const visaoContabil =
    (tela === "visao" || tela === "visao-modulo" ? visaoAberta : visaoDoPlano)?.visaoContabil ?? null;

  const contas = useContas(visaoContabil);
  const realizado = useRealizado(planoAtivo?.ano ?? null, visaoDoPlano?.visaoContabil ?? null);

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

  // --------------------------------------------------------------------------
  // Orçamento em tela
  // --------------------------------------------------------------------------

  const filiaisDoFiltro = useMemo(() => {
    if (filtros.filial === "total") return filiaisAtivas;
    const escolhida = filiaisAtivas.find((filial) => filial.id === filtros.filial);
    return escolhida ? [escolhida] : [];
  }, [filiaisAtivas, filtros.filial]);

  // Contas analíticas que a visão configurou para a combinação em tela. Só
  // CLASSIFICACAO_ANALITICA = 0: sintética não recebe lançamento.
  const contasDisponiveis = useMemo(() => {
    if (!visaoDoPlano || !moduloDaTela) return [];
    const codigos = new Set();
    filiaisDoFiltro.forEach((filial) => {
      contasEfetivasDoModulo(visaoDoPlano, moduloDaTela.id, filial.id, filtros.centro).forEach(
        (codigo) => codigos.add(codigo)
      );
    });
    return [...codigos]
      .filter((codigo) => buscarConta(contas.catalogo, codigo)?.sintetica === false)
      .sort();
  }, [visaoDoPlano, moduloDaTela, filiaisDoFiltro, filtros.centro, contas.catalogo]);

  const contasDaTabela =
    filtros.conta === TODAS_AS_CONTAS ? contasDisponiveis : [filtros.conta];

  const linhasOrcamento = useMemo(() => {
    if (!planoAtivo || !moduloDaTela) return [];
    return criarLinhasOrcamento({
      plano: planoAtivo,
      moduloId: moduloDaTela.id,
      filiais: filiaisDoFiltro,
      centroId: filtros.centro,
      contas: contasDaTabela,
      realizado: realizado.doAno,
      realizadoAnterior: realizado.doAnoAnterior,
    });
  }, [planoAtivo, moduloDaTela, filiaisDoFiltro, filtros.centro, contasDaTabela, realizado]);

  // --------------------------------------------------------------------------
  // Navegação
  // --------------------------------------------------------------------------

  function irParaTopo() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function alterarFiltro(alteracoes) {
    setEditingCell(null);
    setFiltros((atuais) => {
      const proximos = { ...atuais, ...alteracoes };
      // Trocar filial ou centro pode invalidar a conta escolhida.
      if (alteracoes.filial !== undefined || alteracoes.centro !== undefined) {
        proximos.conta = TODAS_AS_CONTAS;
      }
      return proximos;
    });
  }

  function abrirPlano(id) {
    setPlanoAtivoId(id);
    setTela("home");
    setFiltros(FILTROS_PADRAO);
    setEditingCell(null);
    irParaTopo();
  }

  function abrirModulo(moduloId) {
    setTela(moduloId);
    setFiltros(FILTROS_PADRAO);
    setEditingCell(null);
    irParaTopo();
  }

  function abrirVisao(id) {
    setVisaoAbertaId(id);
    setModuloAbertoId(null);
    setTela("visao");
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
    if (TELAS_ERP.has(tela)) return navegar("configuracoes");
    if (moduloDaTela) return navegar("home");
    return navegar("planos");
  }

  // --------------------------------------------------------------------------
  // Planos
  // --------------------------------------------------------------------------

  function salvarNovoPlano() {
    const ano = Number(novoPlano.ano);
    if (!novoPlano.nome.trim()) return setErroPlano("Informe um nome para o plano.");
    if (!novoPlano.visaoId) return setErroPlano("Selecione a visão que este plano vai orçar.");
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return setErroPlano("Informe um ano válido.");
    }

    setPlanos((atuais) => [
      ...atuais,
      criarPlano(gerarId("plano"), novoPlano.nome.trim(), ano, novoPlano.visaoId),
    ]);
    setNovoPlano({ nome: "", ano: String(new Date().getFullYear() + 1), visaoId: null });
    setErroPlano("");
    setDrawerAberto(false);
    return undefined;
  }

  // --------------------------------------------------------------------------
  // Visões
  // --------------------------------------------------------------------------

  function abrirModalVisao(visao = null) {
    setModalVisao({
      id: visao?.id ?? null,
      nome: visao?.nome ?? "",
      visaoContabil: visao?.visaoContabil ?? null,
    });
  }

  function salvarVisao() {
    const nome = modalVisao.nome.trim();
    if (!nome || !modalVisao.visaoContabil) return;

    if (modalVisao.id) {
      setVisoes((atuais) =>
        atuais.map((visao) => {
          if (visao.id !== modalVisao.id) return visao;
          // Trocar a visão contábil invalida as contas: os códigos de uma não
          // existem na outra.
          const trocou = visao.visaoContabil !== modalVisao.visaoContabil;
          return {
            ...visao,
            nome,
            visaoContabil: modalVisao.visaoContabil,
            modulos: trocou ? {} : visao.modulos,
          };
        })
      );
    } else {
      const nova = criarVisao(gerarId("visao"), nome, modalVisao.visaoContabil);
      setVisoes((atuais) => [...atuais, nova]);
      setVisaoAbertaId(nova.id);
      setTela("visao");
      irParaTopo();
    }
    setModalVisao(null);
  }

  const atualizarVisaoAberta = (transformar) =>
    setVisoes((atuais) =>
      atuais.map((visao) => (visao.id === visaoAbertaId ? transformar(visao) : visao))
    );

  // --------------------------------------------------------------------------
  // Configuração: filiais ativas
  // --------------------------------------------------------------------------

  function alternarFilialAtiva(filialId) {
    setConfiguracao((atual) => {
      const base = atual.filiaisAtivas ?? erp.filiais.map((filial) => filial.id);
      const marcadas = new Set(base);
      if (marcadas.has(filialId)) marcadas.delete(filialId);
      else marcadas.add(filialId);
      return { ...atual, filiaisAtivas: [...marcadas] };
    });
  }

  // --------------------------------------------------------------------------
  // Exclusões
  // --------------------------------------------------------------------------

  const pedirExclusao = (tipo) => (item) =>
    setConfirmacao({ tipo, id: item.id, nome: item.nome });

  function descricaoDaConfirmacao() {
    if (confirmacao?.tipo === "plano") {
      return "O plano e todos os valores planejados nele serão removidos.";
    }
    const emUso = planos.filter((plano) => plano.visaoId === confirmacao?.id).length;
    return emUso
      ? `${emUso} ${emUso === 1 ? "plano usa" : "planos usam"} esta visão e ${
          emUso === 1 ? "ficará" : "ficarão"
        } sem módulos de orçamento.`
      : "Nenhum plano usa esta visão.";
  }

  function confirmarExclusao() {
    if (!confirmacao) return;
    if (confirmacao.tipo === "plano") {
      setPlanos((atuais) => atuais.filter((plano) => plano.id !== confirmacao.id));
      if (confirmacao.id === planoAtivoId) navegar("planos");
    } else {
      setVisoes((atuais) => atuais.filter((visao) => visao.id !== confirmacao.id));
      if (confirmacao.id === visaoAbertaId) navegar("visoes");
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
      if (filtros.filial === "total" || filtros.conta === TODAS_AS_CONTAS) return;

      const valor = Math.max(0, parseNumeroPtBr(editingCell.valor));
      const chave = chavePlanejado(
        moduloDaTela.id,
        filtros.filial,
        filtros.centro,
        filtros.conta,
        editingCell.mes
      );
      setPlanos((atuais) =>
        atuais.map((plano) =>
          plano.id === planoAtivoId
            ? { ...plano, planejado: { ...plano.planejado, [chave]: valor } }
            : plano
        )
      );
      setEditingCell(null);
    },
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  function exigirErp(conteudo) {
    if (erp.carregando) {
      return (
        <main className="conteudo">
          <Carregando />
        </main>
      );
    }
    if (erp.erro) {
      return (
        <main className="conteudo">
          <AvisoErro mensagem={erp.erro} onTentarDeNovo={erp.recarregar} />
        </main>
      );
    }
    return conteudo;
  }

  const nomeContabil = (id) => erp.visoesContabeis.find((item) => item.id === id)?.nome ?? null;

  function renderizarTela() {
    if (tela === "visoes") {
      return (
        <TelaVisoes
          visoes={visoes}
          planos={planos}
          nomeContabil={nomeContabil}
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
          nomeContabil={nomeContabil(visaoAberta.visaoContabil)}
          onAbrirModulo={(moduloId) => {
            setModuloAbertoId(moduloId);
            setTela("visao-modulo");
            irParaTopo();
          }}
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
          catalogo={contas.catalogo}
          filiais={filiaisAtivas}
          centros={erp.centros}
          carregando={contas.carregando || erp.carregando}
          erro={contas.erro || erp.erro}
          onRecarregar={contas.recarregar}
          onDefinirContasDaFilial={(moduloId, filialId, lista) =>
            atualizarVisaoAberta((visao) => definirContasDaFilial(visao, moduloId, filialId, lista))
          }
          onDefinirContasDoCentro={(moduloId, filialId, centroId, lista) =>
            atualizarVisaoAberta((visao) =>
              definirContasDoCentro(visao, moduloId, filialId, centroId, lista)
            )
          }
          onAlternarUsaCentro={(moduloId, usa) =>
            atualizarVisaoAberta((visao) => definirUsaCentroDeCusto(visao, moduloId, usa))
          }
          onVoltar={voltar}
        />
      );
    }

    if (tela === "configuracoes") {
      return exigirErp(
        <TelaConfiguracoes
          filiais={erp.filiais}
          filiaisAtivas={filiaisAtivas}
          centros={erp.centros}
          visoesContabeis={erp.visoesContabeis}
          onAbrir={(id) => navegar(id)}
        />
      );
    }

    if (TELAS_ERP.has(tela)) {
      return exigirErp(
        <TelaListaErp
          tela={tela}
          lista={tela === "filiais" ? erp.filiais : erp.centros}
          ativas={configuracao.filiaisAtivas}
          onAlternarAtiva={alternarFilialAtiva}
          onDefinirAtivas={(ids) => setConfiguracao((atual) => ({ ...atual, filiaisAtivas: ids }))}
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
      return exigirErp(
        <TelaOrcamento
          plano={planoAtivo}
          visao={visaoDoPlano}
          modulo={moduloDaTela}
          catalogo={contas.catalogo}
          filiais={filiaisAtivas}
          centros={erp.centros}
          contasDisponiveis={contasDisponiveis}
          filtros={filtros}
          onAlterarFiltro={alterarFiltro}
          linhas={linhasOrcamento}
          carregandoRealizado={realizado.carregando || contas.carregando}
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
        badgeConfiguracoes={
          erp.carregando || erp.erro ? undefined : filiaisAtivas.length + erp.centros.length
        }
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
        {realizado.erro ? (
          <p className="aviso-fixo" role="status">
            Realizado não carregou: {realizado.erro}
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
        <ModalVisao
          edicao={!!modalVisao.id}
          nome={modalVisao.nome}
          visaoContabil={modalVisao.visaoContabil}
          visoesContabeis={erp.visoesContabeis}
          onAlterarNome={(nome) => setModalVisao((atual) => ({ ...atual, nome }))}
          onAlterarVisaoContabil={(visaoContabil) =>
            setModalVisao((atual) => ({ ...atual, visaoContabil }))
          }
          onSalvar={salvarVisao}
          onFechar={() => setModalVisao(null)}
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
