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

import { EMPRESA, MESES } from "./dados/seeds.js";
import { ehModulo, modulo as definicaoDoModulo } from "./dados/modulos.js";
import {
  baseDoPercentual,
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  gerarId,
  receitasDaBase,
} from "./dados/plano.js";
import {
  SEM_CENTRO,
  contasEfetivasDoModulo,
  criarVisao,
  definirSinalDaConta,
  sinaisDoModulo,
  definirContasDaFilial,
  definirContasDoCentro,
  definirUsaCentroDeCusto,
  usaCentroDeCusto,
} from "./dados/visao.js";
import { montarDre } from "./dados/dre.js";
import { conta as buscarConta } from "./dados/contas.js";
import { filiaisForaDoUso } from "./dados/realizado.js";
import { contasDoMapeamento, temMapeamentoPadrao } from "./dados/mapeamentoPadrao.js";
import { MODULOS } from "./dados/modulos.js";
import { carregarEstado, salvarEstado } from "./lib/persistencia.js";
import { formatarParaEdicao, parseNumeroPtBr } from "./lib/formato.js";
import { aplicarTema, temaInicial } from "./lib/tema.js";
import { useCadastrosDoErp, useContas, useRealizado } from "./lib/useErp.js";

const FILTROS_PADRAO = {
  filial: "total",
  centro: SEM_CENTRO,
  conta: TODAS_AS_CONTAS,
  // Conta de receita que serve de base — só usada nos módulos percentuais.
  receita: TODAS_AS_CONTAS,
};
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

  // Contas de receita que servem de base ao percentual. Só valem as analíticas,
  // pelo mesmo motivo das contas do módulo: sintética não recebe lançamento,
  // então também não tem valor planejado para servir de base.
  const receitasDisponiveis = useMemo(() => {
    if (!visaoDoPlano || !moduloDaTela?.percentual) return [];
    const codigos = new Set();
    filiaisDoFiltro.forEach((filial) => {
      receitasDaBase(visaoDoPlano, filial.id).forEach((codigo) => codigos.add(codigo));
    });
    return [...codigos]
      .filter((codigo) => buscarConta(contas.catalogo, codigo)?.sintetica === false)
      .sort();
  }, [visaoDoPlano, moduloDaTela, filiaisDoFiltro, contas.catalogo]);

  // Planejado do ano de cada conta de receita, para a lista da esquerda mostrar
  // sobre quanto o percentual incide sem precisar sair da tela.
  const totaisDasReceitas = useMemo(() => {
    const mapa = new Map();
    if (!planoAtivo || !visaoDoPlano) return mapa;

    receitasDisponiveis.forEach((codigo) => {
      let total = 0;
      filiaisDoFiltro.forEach((filial) => {
        MESES.forEach((mes) => {
          total += baseDoPercentual(planoAtivo, visaoDoPlano, filial.id, mes, [codigo]);
        });
      });
      mapa.set(codigo, total);
    });
    return mapa;
  }, [planoAtivo, visaoDoPlano, receitasDisponiveis, filiaisDoFiltro]);

  // Filiais com movimento que ficaram de fora da configuração, no ano do plano OU
  // no anterior. Sem avisar, o total sai menor que o do ERP e parece erro de
  // cálculo — e a filial que só tem movimento no ano anterior mexe só na coluna
  // comparativa, o que é ainda mais difícil de perceber.
  const filiaisIgnoradas = useMemo(() => {
    const fora = filiaisForaDoUso([realizado.doAno, realizado.doAnoAnterior], filiaisAtivas);
    return fora.map((id) => erp.filiais.find((filial) => filial.id === id) ?? { id });
  }, [realizado.doAno, realizado.doAnoAnterior, filiaisAtivas, erp.filiais]);

  const contasDaTabela =
    filtros.conta === TODAS_AS_CONTAS ? contasDisponiveis : [filtros.conta];
  // Só recorta quando há uma receita escolhida. Em "Todas as receitas" o
  // planejado cai no fallback (todas as da filial) e o realizado fica com a
  // conta contábil inteira — que é o mesmo número, sem risco de perder o
  // movimento de um centro que a visão não tenha configurado.
  const receitasDaTabela =
    moduloDaTela?.percentual && filtros.receita !== TODAS_AS_CONTAS
      ? [filtros.receita]
      : undefined;

  // DRE consolidado da visão geral. Fica aqui porque depende do mesmo recorte de
  // filial das telas de módulo — trocar a filial vale para as duas.
  const dre = useMemo(() => {
    if (!planoAtivo || !visaoDoPlano) return [];
    return montarDre({
      plano: planoAtivo,
      visao: visaoDoPlano,
      filiais: filiaisDoFiltro,
      catalogo: contas.catalogo,
      realizado: realizado.doAno,
      realizadoAnterior: realizado.doAnoAnterior,
    });
  }, [planoAtivo, visaoDoPlano, filiaisDoFiltro, contas.catalogo, realizado]);

  const linhasOrcamento = useMemo(() => {
    if (!planoAtivo || !moduloDaTela) return [];
    return criarLinhasOrcamento({
      plano: planoAtivo,
      visao: visaoDoPlano,
      moduloId: moduloDaTela.id,
      filiais: filiaisDoFiltro,
      centroId: filtros.centro,
      contas: contasDaTabela,
      receitas: receitasDaTabela,
      catalogo: contas.catalogo,
      sinais: sinaisDoModulo(visaoDoPlano, moduloDaTela.id),
      visaoContabil: visaoDoPlano?.visaoContabil,
      realizado: realizado.doAno,
      realizadoAnterior: realizado.doAnoAnterior,
    });
  }, [planoAtivo, visaoDoPlano, moduloDaTela, filiaisDoFiltro, filtros.centro, contasDaTabela, receitasDaTabela, contas.catalogo, realizado]);

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
      // Trocar filial ou centro pode invalidar a conta e a receita escolhidas.
      if (alteracoes.filial !== undefined || alteracoes.centro !== undefined) {
        proximos.conta = TODAS_AS_CONTAS;
        proximos.receita = TODAS_AS_CONTAS;
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

  // Ponto de partida: preenche os módulos com as faixas que o Scoreplan usa na
  // visão contábil 25. Aplica nas filiais ativas e o usuário ajusta depois — a
  // visão continua sendo escolha de quem monta.
  function aplicarMapeamentoPadrao() {
    if (!visaoAberta || !temMapeamentoPadrao(visaoAberta.visaoContabil)) return;
    atualizarVisaoAberta((visao) => {
      let proxima = visao;
      MODULOS.forEach((modulo) => {
        const codigos = contasDoMapeamento(contas.catalogo, modulo.id);
        if (!codigos.length) return;
        filiaisAtivas.forEach((filial) => {
          proxima = definirContasDaFilial(proxima, modulo.id, filial.id, codigos);
        });
      });
      return proxima;
    });
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

  // Célula do filtro em tela. Só existe quando há uma filial e uma conta
  // escolhidas — em "Total" o valor é soma de várias chaves e não há onde gravar.
  // Em módulo percentual a receita-base também precisa estar escolhida: o mesmo
  // percentual dá valores diferentes conforme a receita sobre a qual incide.
  function chaveDoFiltro(mes) {
    return chavePlanejado(
      moduloDaTela.id,
      filtros.filial,
      filtros.centro,
      filtros.conta,
      mes,
      moduloDaTela.percentual ? filtros.receita : null
    );
  }

  function podeGravar() {
    return (
      planoAtivo &&
      moduloDaTela &&
      filtros.filial !== "total" &&
      filtros.conta !== TODAS_AS_CONTAS &&
      (!moduloDaTela.percentual || filtros.receita !== TODAS_AS_CONTAS)
    );
  }

  function gravarPlanejado(alteracoes) {
    setPlanos((atuais) =>
      atuais.map((plano) =>
        plano.id === planoAtivoId
          ? { ...plano, planejado: { ...plano.planejado, ...alteracoes } }
          : plano
      )
    );
  }

  // Receita planejada de cada mês, para converter valor digitado em reais no
  // percentual que fica gravado.
  const basePorMes = useMemo(() => {
    const mapa = new Map();
    linhasOrcamento.forEach((linha) => {
      if (typeof linha.id === "number") mapa.set(linha.id, linha.base ?? 0);
    });
    return mapa;
  }, [linhasOrcamento]);

  const edicao = {
    editingCell,
    // `valor` em texto entra cru: é o dígito que abriu a edição, e formatá-lo
    // como número o transformaria em outra coisa.
    onIniciarEdicao: (id, valor, mes, emReais = false) =>
      setEditingCell({
        id,
        mes,
        emReais,
        valor: typeof valor === "string" ? valor : formatarParaEdicao(valor),
      }),
    onAlterarEdicao: (valor) => setEditingCell((atual) => (atual ? { ...atual, valor } : atual)),
    onCancelarEdicao: () => setEditingCell(null),

    onConfirmarEdicao: ({ id, replicar } = {}) => {
      if (!editingCell) return;
      // Blur de uma célula que a navegação já deixou para trás: quem está em
      // edição agora é outra, e gravar aqui sobrescreveria a célula errada.
      if (id && id !== editingCell.id) return;
      if (!podeGravar()) return;

      const digitado = Math.max(0, parseNumeroPtBr(editingCell.valor));
      const meses = replicar ? MESES.filter((mes) => mes >= editingCell.mes) : [editingCell.mes];

      // Digitar em reais é lançar pelo outro lado: o que fica gravado continua
      // sendo o percentual, para o plano seguir acompanhando a receita. A
      // conversão é por mês — replicar um valor em reais sobre bases diferentes
      // dá um percentual diferente em cada mês, que é o que se espera.
      const alteracoes = {};
      meses.forEach((mes) => {
        const base = editingCell.emReais ? basePorMes.get(mes) : 0;
        alteracoes[chaveDoFiltro(mes)] = editingCell.emReais
          ? base
            ? (digitado / base) * 100
            : 0
          : digitado;
      });
      gravarPlanejado(alteracoes);
      setEditingCell(null);
    },

    // Ctrl+D: copia o mês de cima, como no Excel.
    onCopiarDeCima: (mes) => {
      if (!podeGravar() || mes <= 1) return;
      const acima = planoAtivo.planejado[chaveDoFiltro(mes - 1)] ?? 0;
      gravarPlanejado({ [chaveDoFiltro(mes)]: acima });
    },

    // Alça de preenchimento: repete o valor do mês de origem em toda a faixa
    // arrastada. Funciona nos dois sentidos — arrastar para cima é tão válido
    // quanto para baixo.
    onPreencherAte: (mesOrigem, mesFinal) => {
      if (!podeGravar()) return;
      const valor = planoAtivo.planejado[chaveDoFiltro(mesOrigem)] ?? 0;
      const inicio = Math.min(mesOrigem, mesFinal);
      const fim = Math.max(mesOrigem, mesFinal);

      const alteracoes = {};
      MESES.filter((mes) => mes >= inicio && mes <= fim).forEach((mes) => {
        alteracoes[chaveDoFiltro(mes)] = valor;
      });
      gravarPlanejado(alteracoes);
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
          onAplicarMapeamento={
            temMapeamentoPadrao(visaoAberta.visaoContabil) && !contas.carregando
              ? aplicarMapeamentoPadrao
              : null
          }
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
          onDefinirSinal={(moduloId, codigo, tipo) =>
            atualizarVisaoAberta((visao) => definirSinalDaConta(visao, moduloId, codigo, tipo))
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
          receitasDisponiveis={receitasDisponiveis}
          totaisDasReceitas={totaisDasReceitas}
          filiaisIgnoradas={filiaisIgnoradas}
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
        dre={dre}
        filiais={filiaisAtivas}
        filtroFilial={filtros.filial}
        onAlterarFiltroFilial={(filial) => alterarFiltro({ filial })}
        carregandoRealizado={realizado.carregando}
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
