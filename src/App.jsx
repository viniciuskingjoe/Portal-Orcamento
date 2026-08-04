import { useEffect, useMemo, useRef, useState } from "react";

import Sidebar from "./componentes/Sidebar.jsx";
import DrawerNovoPlano from "./componentes/DrawerNovoPlano.jsx";
import ModalVisao from "./componentes/ModalVisao.jsx";
import ModalConfirmacao from "./componentes/ModalConfirmacao.jsx";
import { AvisoErro, Carregando } from "./componentes/Estados.jsx";

import TelaPlanos from "./telas/TelaPlanos.jsx";
import TelaHome from "./telas/TelaHome.jsx";
import TelaConfiguracoes from "./telas/TelaConfiguracoes.jsx";
import TelaListaErp from "./telas/TelaListaErp.jsx";
import TelaGrupos from "./telas/TelaGrupos.jsx";
import TelaGrupo from "./telas/TelaGrupo.jsx";
import TelaVisoes from "./telas/TelaVisoes.jsx";
import TelaVisao from "./telas/TelaVisao.jsx";
import TelaVisaoModulo from "./telas/TelaVisaoModulo.jsx";
import TelaDre from "./telas/TelaDre.jsx";
import TelaOrcamento, { TODAS_AS_CONTAS } from "./telas/TelaOrcamento.jsx";
import TelaLogin from "./telas/TelaLogin.jsx";
import TelaTrocarSenha from "./telas/TelaTrocarSenha.jsx";
import TelaUsuarios from "./telas/TelaUsuarios.jsx";

import { EMPRESA, MESES } from "./dados/seeds.js";
import { ehModulo, modulo as definicaoDoModulo } from "./dados/modulos.js";
import {
  baseDoPercentual,
  chavePlanejado,
  criarLinhasOrcamento,
  criarPlano,
  gerarId,
  receitasDaBase,
  valorParaGravar,
} from "./dados/plano.js";
import {
  SEM_CENTRO,
  centrosDaFilial,
  contasEfetivasDoModulo,
  criarVisao,
  definirSinalDaConta,
  sinaisDoModulo,
  definirContasDoCentro,
  definirUsoDoCentro,
  usaCentroDeCusto,
} from "./dados/visao.js";
import { montarDre } from "./dados/dre.js";
import {
  centrosPermitidos,
  ehAdmin,
  filiaisPermitidas,
  modulosPermitidos,
  podeLancar,
  resumirEscopo,
} from "./dados/permissoes.js";
import { conta as buscarConta } from "./dados/contas.js";
import { filiaisForaDoUso } from "./dados/realizado.js";
import { contasDoMapeamento, temMapeamentoPadrao } from "./dados/mapeamentoPadrao.js";
import { MODULOS } from "./dados/modulos.js";
import { carregarEstado, celulaDaChave, estado as repo } from "./lib/estado.js";
import { descartarEstadoLegado, estadoInicial, lerEstadoLegado } from "./lib/persistencia.js";
import { formatarParaEdicao, parseNumeroPtBr } from "./lib/formato.js";
import { aplicarTema, temaInicial } from "./lib/tema.js";
import { useCadastrosDoErp, useContas, useRealizado } from "./lib/useErp.js";
import { useSessao } from "./lib/useSessao.js";

const FILTROS_PADRAO = {
  filial: "total",
  centro: SEM_CENTRO,
  conta: TODAS_AS_CONTAS,
  // Conta de receita que serve de base — só usada nos módulos percentuais.
  receita: TODAS_AS_CONTAS,
};
const TELAS_ERP = new Set(["filiais", "centros"]);

// `undefined` cai no padrao do modal, que fala em exclusao.
const TITULO_CONFIRMACAO = { desativar: "Desativar plano" };
const ROTULO_CONFIRMACAO = { desativar: "Desativar" };

// Portão: sem sessão não se renderiza o portal. O componente inteiro fica
// desmontado, então nem os dados do ERP chegam a ser pedidos.
export default function App() {
  const { sessao, carregando, entrando, erro, entrar, sair, trocarSenha } = useSessao();

  if (carregando) {
    return (
      <main className="tela-login">
        <Carregando texto="Verificando a sessão…" />
      </main>
    );
  }

  if (!sessao) return <TelaLogin onEntrar={entrar} carregando={entrando} erro={erro} />;

  // Troca pendente tranca o portal antes de qualquer tela. Não é só cortesia: o
  // servidor recusa todas as outras rotas com 428 enquanto isso, então deixar
  // passar daria uma tela montada onde nada funciona.
  if (sessao.trocarSenha) {
    return <TelaTrocarSenha sessao={sessao} obrigatoria onTrocar={trocarSenha} />;
  }

  // `key` remonta o portal inteiro quando troca o usuário: estado de tela, de
  // filtro e de edição de outra pessoa não pode sobreviver ao login seguinte.
  return <PlanejamentoOrcamentario key={sessao.login} sessao={sessao} onSair={sair} />;
}

function PlanejamentoOrcamentario({ sessao, onSair }) {
  const [configuracao, setConfiguracao] = useState(estadoInicial().configuracao);
  const [visoes, setVisoes] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [carregandoEstado, setCarregandoEstado] = useState(true);
  const [erroEstado, setErroEstado] = useState("");
  // O que ficou no navegador de antes da migração, quando o banco ainda está
  // vazio. Oferecido uma vez; importar é decisão de quem está vendo.
  const [legado, setLegado] = useState(null);

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
  const [avisoPublicacao, setAvisoPublicacao] = useState("");
  const [publicando, setPublicando] = useState(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [grupos, setGrupos] = useState([]);
  const [grupoAbertoId, setGrupoAbertoId] = useState(null);

  // Guardas da atualização de fundo — ver o efeito mais abaixo.
  const gravacoesEmVoo = useRef(0);
  const editandoAgora = useRef(false);

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
    const emUso = escolhidas
      ? erp.filiais.filter((filial) => new Set(escolhidas).has(filial.id))
      : erp.filiais;
    // Escopo por cima da configuração: mostrar filial que não se pode ver já é
    // vazamento — o nome das filiais diz o tamanho da operação.
    return filiaisPermitidas(sessao, emUso, { modulo: moduloDaTela?.id });
  }, [erp.filiais, configuracao.filiaisAtivas, sessao, moduloDaTela]);

  const centrosPermitidosNaTela = useMemo(
    () => centrosPermitidos(sessao, erp.centros, { modulo: moduloDaTela?.id }),
    [sessao, erp.centros, moduloDaTela]
  );

  // O que a pessoa está vendo, quando não é tudo. Sem isto o DRE de quem tem um
  // centro só não bate com o da empresa e vira "erro de cálculo".
  const escopo = useMemo(
    () => resumirEscopo(sessao, { filiais: erp.filiais, centros: erp.centros }),
    [sessao, erp.filiais, erp.centros]
  );

  // Módulos que o escopo deixa ver — vale para a barra lateral, os cartões da
  // visão geral e a configuração da visão.
  const modulosVisiveis = useMemo(() => modulosPermitidos(sessao, MODULOS), [sessao]);

  // O DRE só faz sentido inteiro: com um módulo de fora, os subtotais deixam de
  // ser o resultado da empresa e viram um número que não fecha com nada.
  const podeVerDre = modulosVisiveis.length === MODULOS.length;

  // Cadastros do ERP recortados: mostrar filial ou centro que a pessoa não pode
  // ver já é vazamento — o nome deles diz o tamanho da operação.
  const filiaisDoErpVisiveis = useMemo(
    () => filiaisPermitidas(sessao, erp.filiais),
    [sessao, erp.filiais]
  );
  const centrosDoErpVisiveis = useMemo(
    () => (ehAdmin(sessao) ? erp.centros : centrosPermitidos(sessao, erp.centros, { modulo: null })),
    [sessao, erp.centros]
  );

  // A visão contábil em uso depende de onde se está: montando uma visão ou
  // orçando um plano.
  const grupoAberto = useMemo(
    () => grupos.find((grupo) => grupo.id === grupoAbertoId) ?? null,
    [grupos, grupoAbertoId]
  );

  const visaoContabil =
    tela === "grupo"
      ? (grupoAberto?.visaoContabil ?? null)
      : ((tela === "visao" || tela === "visao-modulo" ? visaoAberta : visaoDoPlano)?.visaoContabil ??
        null);

  const contas = useContas(visaoContabil);
  const realizado = useRealizado(planoAtivo?.ano ?? null, visaoDoPlano?.visaoContabil ?? null);

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  useEffect(() => {
    let vivo = true;
    repo.grupos().then((lista) => vivo && setGrupos(lista)).catch(() => {});
    carregarEstado()
      .then((dados) => {
        if (!vivo) return;
        setConfiguracao(dados.configuracao);
        setVisoes(dados.visoes);
        setPlanos(dados.planos);
        // Banco vazio e algo no navegador: é a migração pendente.
        if (!dados.visoes.length && !dados.planos.length) setLegado(lerEstadoLegado());
      })
      .catch((erro) => vivo && setErroEstado(erro.message))
      .finally(() => vivo && setCarregandoEstado(false));
    return () => {
      vivo = false;
    };
  }, []);

  // --------------------------------------------------------------------------
  // Manter a tela em dia com o que os outros fizeram
  //
  // Visão e plano são de todo mundo, mas o estado era lido uma vez só, no login.
  // Quem deixava a tela aberta não via a configuração que outro administrador
  // acabou de fazer — e, pior, gravava por cima achando que estava atualizado.
  //
  // Recarrega quando a aba volta ao foco, que é o caso comum (a pessoa foi ver
  // outra coisa e voltou), e a cada minuto enquanto está visível.
  //
  // NUNCA durante uma edição ou com gravação em voo: a tela é otimista, e uma
  // leitura que chegue entre o "aplica local" e o "gravou" traz o valor antigo
  // de volta e desfaz o que a pessoa acabou de digitar.
  // --------------------------------------------------------------------------
  useEffect(() => {
    editandoAgora.current = Boolean(editingCell);
  }, [editingCell]);

  useEffect(() => {
    let vivo = true;

    async function atualizar() {
      if (!vivo || document.hidden) return;
      if (editandoAgora.current || gravacoesEmVoo.current > 0) return;

      try {
        const [dados, lista] = await Promise.all([carregarEstado(), repo.grupos()]);
        if (!vivo) return;
        setConfiguracao(dados.configuracao);
        setVisoes(dados.visoes);
        setPlanos(dados.planos);
        setGrupos(lista);
      } catch {
        // Silêncio de propósito: isto é atualização de fundo, e uma faixa
        // vermelha por causa de uma falha de rede que ninguém pediu assusta sem
        // motivo. O erro de quem está GRAVANDO continua aparecendo.
      }
    }

    const aoMudarVisibilidade = () => {
      if (!document.hidden) atualizar();
    };

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("focus", atualizar);
    const relogio = setInterval(atualizar, 60_000);

    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("focus", atualizar);
      clearInterval(relogio);
    };
  }, []);

  // A tela é otimista: aplica a mudança e grava em seguida. Quem digita doze
  // meses seguidos não pode esperar ida e volta a cada tecla — mas se a gravação
  // falhar, o aviso precisa aparecer, porque o que está na tela deixou de valer.
  function gravar(promessa) {
    // Conta as gravações em voo para a atualização de fundo não ler o banco no
    // meio de uma e trazer o valor antigo de volta.
    gravacoesEmVoo.current += 1;
    Promise.resolve(promessa)
      .then(() => setAvisoPersistencia(""))
      .catch((erro) =>
        setAvisoPersistencia(
          `Não foi possível salvar: ${erro.message} Recarregue a página para ver o que está gravado.`
        )
      )
      .finally(() => {
        gravacoesEmVoo.current -= 1;
      });
  }

  async function importarLegado() {
    try {
      await repo.importar(legado);
      descartarEstadoLegado();
      setLegado(null);
      const dados = await carregarEstado();
      setConfiguracao(dados.configuracao);
      setVisoes(dados.visoes);
      setPlanos(dados.planos);
    } catch (erro) {
      setAvisoPersistencia(`Não foi possível importar: ${erro.message}`);
    }
  }

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
    if (tela === "grupo") return navegar("grupos");
    if (tela === "grupos") return navegar("configuracoes");
    if (TELAS_ERP.has(tela)) return navegar("configuracoes");
    if (moduloDaTela) return navegar("home");
    return navegar("planos");
  }

  // --------------------------------------------------------------------------
  // Planos
  // --------------------------------------------------------------------------

  // Abre o mesmo formulário já preenchido a partir de um plano existente. A
  // visão vem travada: copiar o planejado para outra visão daria chaves que
  // apontam para contas que ela não tem, e a cópia nasceria com valores
  // invisíveis na tela.
  function pedirCopia(plano) {
    setNovoPlano({
      nome: `${plano.nome} (cópia)`,
      ano: String(plano.ano),
      visaoId: plano.visaoId,
      copiaDe: plano.id,
    });
    setErroPlano("");
    setDrawerAberto(true);
  }

  async function salvarNovoPlano() {
    const ano = Number(novoPlano.ano);
    if (!novoPlano.nome.trim()) return setErroPlano("Informe um nome para o plano.");
    if (!novoPlano.visaoId) return setErroPlano("Selecione a visão que este plano vai orçar.");
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return setErroPlano("Informe um ano válido.");
    }

    const id = gerarId("plano");
    const limpar = () => {
      setNovoPlano({ nome: "", ano: String(new Date().getFullYear() + 1), visaoId: null });
      setErroPlano("");
      setDrawerAberto(false);
    };

    if (novoPlano.copiaDe) {
      // A cópia é feita no servidor: são centenas de células, e mandá-las de
      // volta pela rede só para o banco regravá-las seria trabalho à toa.
      try {
        await repo.plano.duplicar(novoPlano.copiaDe, { novoId: id, nome: novoPlano.nome.trim(), ano });
        const dados = await carregarEstado();
        setPlanos(dados.planos);
        limpar();
      } catch (erro) {
        setErroPlano(`Não foi possível copiar: ${erro.message}`);
      }
      return undefined;
    }

    const plano = criarPlano(id, novoPlano.nome.trim(), ano, novoPlano.visaoId);
    setPlanos((atuais) => [...atuais, plano]);
    gravar(repo.plano.salvar(plano));
    limpar();
    return undefined;
  }

  // --------------------------------------------------------------------------
  // Grupos de centro de custo
  // --------------------------------------------------------------------------

  function novoGrupo() {
    // Nasce na visão contábil que o portal já usa: quase sempre é a certa, e
    // trocar é um campo na tela seguinte.
    const padrao = visoes[0]?.visaoContabil ?? erp.visoesContabeis[0]?.id ?? "25";
    const grupo = { id: gerarId("grupo"), nome: "", visaoContabil: padrao, centros: [], contas: [] };
    setGrupos((atuais) => [...atuais, grupo]);
    setGrupoAbertoId(grupo.id);
    navegar("grupo");
  }

  async function salvarGrupo(grupo) {
    await repo.grupo.salvar(grupo);
    setGrupos(await repo.grupos());
    navegar("grupos");
  }

  // Só na memória: a visão contábil do grupo vira gravação quando ele for
  // salvo, junto do resto.
  const trocarVisaoContabilDoGrupo = (visaoContabil) =>
    setGrupos((atuais) =>
      atuais.map((grupo) => (grupo.id === grupoAbertoId ? { ...grupo, visaoContabil } : grupo))
    );

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
      gravar(repo.visao.salvar({ id: modalVisao.id, nome, visaoContabil: modalVisao.visaoContabil }));
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
      gravar(repo.visao.salvar(nova));
      setVisoes((atuais) => [...atuais, nova]);
      setVisaoAbertaId(nova.id);
      setTela("visao");
      irParaTopo();
    }
    setModalVisao(null);
  }

  // Ponto de partida: preenche os módulos com as faixas que o Scoreplan usa na
  // visão contábil 25. O usuário ajusta depois — a visão continua sendo escolha
  // de quem monta.
  //
  // Como todo módulo é orçado por centro, o padrão vai para os CENTROS que cada
  // filial já marcou. Filial sem centro marcado não recebe nada: não há onde pôr
  // a conta, e inventar um centro seria decidir orçamento no lugar de alguém.
  function aplicarMapeamentoPadrao() {
    if (!visaoAberta || !temMapeamentoPadrao(visaoAberta.visaoContabil)) return;

    atualizarVisaoAberta((visao) => {
      let proxima = visao;

      MODULOS.forEach((modulo) => {
        const codigos = contasDoMapeamento(contas.catalogo, modulo.id);
        if (!codigos.length) return;

        const lote = [];
        filiaisAtivas.forEach((filial) => {
          centrosDaFilial(visao, modulo.id, filial.id).forEach((centro) => {
            proxima = definirContasDoCentro(proxima, modulo.id, filial.id, centro, codigos);
            lote.push({ filial: filial.id, centro, contas: codigos });
          });
        });

        // Um lote por módulo: centro a centro seriam centenas de requisições.
        if (lote.length) gravar(repo.visao.contasEmLote(visaoAberta.id, modulo.id, lote));
      });

      return proxima;
    });
  }

  // Quantos centros o padrão alcançaria — é o que a tela precisa dizer antes de
  // alguém clicar e achar que não funcionou.
  const centrosParaOPadrao = useMemo(() => {
    if (!visaoAberta) return 0;
    return MODULOS.reduce(
      (total, modulo) =>
        total +
        filiaisAtivas.reduce(
          (soma, filial) => soma + centrosDaFilial(visaoAberta, modulo.id, filial.id).length,
          0
        ),
      0
    );
  }, [visaoAberta, filiaisAtivas]);

  const atualizarVisaoAberta = (transformar) =>
    setVisoes((atuais) =>
      atuais.map((visao) => (visao.id === visaoAbertaId ? transformar(visao) : visao))
    );

  // --------------------------------------------------------------------------
  // Configuração: filiais ativas
  // --------------------------------------------------------------------------

  function definirFiliaisAtivas(ids) {
    setConfiguracao((atual) => ({ ...atual, filiaisAtivas: ids }));
    gravar(repo.configuracao("filiaisAtivas", ids));
  }

  function alternarFilialAtiva(filialId) {
    const base = configuracao.filiaisAtivas ?? erp.filiais.map((filial) => filial.id);
    const marcadas = new Set(base);
    if (marcadas.has(filialId)) marcadas.delete(filialId);
    else marcadas.add(filialId);
    definirFiliaisAtivas([...marcadas]);
  }

  // --------------------------------------------------------------------------
  // Exclusões
  // --------------------------------------------------------------------------

  const pedirExclusao = (tipo) => (item) =>
    setConfirmacao({ tipo, id: item.id, nome: item.nome });

  // --------------------------------------------------------------------------
  // Publicar no orçamento do Linx
  //
  // Passa por confirmação porque o efeito SAI do portal: o número vai para a
  // tabela que o Power BI lê, e a partir dali é ele que a diretoria enxerga.
  // --------------------------------------------------------------------------

  // Reativar nao precisa de confirmacao: nao destroi nada e se desfaz com outro
  // clique. Desativar tira o plano da lista, entao pergunta.
  const pedirSituacao = (plano) => {
    if (plano.situacao === "inativo") return alterarSituacao(plano.id, "ativo");
    setConfirmacao({ tipo: "desativar", id: plano.id, nome: plano.nome });
  };

  function alterarSituacao(planoId, situacao) {
    setPlanos((atuais) =>
      atuais.map((plano) => (plano.id === planoId ? { ...plano, situacao } : plano))
    );
    gravar(repo.plano.situacao(planoId, situacao));
    if (situacao === "inativo" && planoId === planoAtivoId) navegar("planos");
  }

  async function publicarNoLinx(planoId) {
    setPublicando(planoId);
    setAvisoPersistencia("");
    try {
      const { linhas, idOrcamento } = await repo.plano.publicar(planoId);
      // Relê para a data de publicação vir do servidor, não de um relógio local
      // que pode estar adiantado em relação ao banco.
      const dados = await carregarEstado();
      setPlanos(dados.planos);
      // Diz o número do orçamento porque é por ele que se confere no SSMS e é
      // por ele que o Power BI filtra — sem isso a pessoa sabe que "deu certo"
      // e não sabe onde olhar.
      setAvisoPublicacao(
        linhas
          ? `Sincronizado: ${linhas} ${linhas === 1 ? "linha" : "linhas"} no orçamento ${idOrcamento} do Linx.`
          : "Nada a sincronizar — este plano ainda não tem valor lançado."
      );
    } catch (erro) {
      // Erro aqui é do ERP e precisa aparecer inteiro: a mensagem do servidor
      // diz se foi o status do orçamento, o exercício que falta no Linx ou
      // outra coisa, e cada uma tem um dono diferente para resolver.
      setAvisoPersistencia(`Não foi possível sincronizar: ${erro.message}`);
    } finally {
      setPublicando(null);
    }
  }

  function descricaoDaConfirmacao() {
    if (confirmacao?.tipo === "grupo") {
      return "O grupo é só um recorte de leitura: nenhum valor planejado é afetado.";
    }
    if (confirmacao?.tipo === "desativar") {
      return (
        "O plano sai da lista, mas nada e apagado: o planejado continua guardado e " +
        "da para reativar depois. No Linx o orcamento dele fica marcado como inativo."
      );
    }
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
    // Publicar nao e exclusao; compartilha o modal porque a pergunta e a mesma
    // -- "tem certeza?" -- e o efeito tambem sai do portal.
    if (confirmacao.tipo === "grupo") {
      setGrupos((atuais) => atuais.filter((grupo) => grupo.id !== confirmacao.id));
      gravar(repo.grupo.excluir(confirmacao.id));
      setConfirmacao(null);
      return;
    }
    if (confirmacao.tipo === "desativar") {
      alterarSituacao(confirmacao.id, "inativo");
      setConfirmacao(null);
      return;
    }
    if (confirmacao.tipo === "plano") {
      setPlanos((atuais) => atuais.filter((plano) => plano.id !== confirmacao.id));
      gravar(repo.plano.excluir(confirmacao.id));
      if (confirmacao.id === planoAtivoId) navegar("planos");
    } else {
      setVisoes((atuais) => atuais.filter((visao) => visao.id !== confirmacao.id));
      gravar(repo.visao.excluir(confirmacao.id));
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
    // Um lote só: a alça e o Ctrl+Enter mexem em até doze meses de uma vez, e
    // doze requisições dariam doze chances de gravar metade.
    gravar(
      repo.plano.planejado(
        planoAtivoId,
        Object.entries(alteracoes).map(([chave, valor]) => celulaDaChave(chave, valor))
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
        alteracoes[chaveDoFiltro(mes)] = valorParaGravar({
          digitado,
          emReais: editingCell.emReais,
          percentual: moduloDaTela.percentual,
          base: basePorMes.get(mes),
        });
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
    // Sem o estado carregado, qualquer tela mostraria "nenhum plano" — que é
    // exatamente o que assusta quem tem um plano gravado.
    if (carregandoEstado) {
      return (
        <main className="conteudo">
          <Carregando texto="Carregando o orçamento…" />
        </main>
      );
    }
    if (erroEstado) {
      return (
        <main className="conteudo">
          <AvisoErro mensagem={erroEstado} onTentarDeNovo={() => window.location.reload()} />
        </main>
      );
    }

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
          modulosVisiveis={modulosVisiveis}
          somenteLeitura={!ehAdmin(sessao)}
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
          onDefinirContasDoCentro={(moduloId, filialId, centroId, lista) => {
            atualizarVisaoAberta((visao) =>
              definirContasDoCentro(visao, moduloId, filialId, centroId, lista)
            );
            gravar(repo.visao.contas(visaoAberta.id, moduloId, filialId, centroId, lista));
          }}
          onDefinirUsoDoCentro={(moduloId, filialId, centroId, usa) => {
            atualizarVisaoAberta((visao) =>
              definirUsoDoCentro(visao, moduloId, filialId, centroId, usa)
            );
            gravar(repo.visao.usoDoCentro(visaoAberta.id, moduloId, filialId, centroId, usa));
          }}
          onDefinirSinal={(moduloId, codigo, tipo) => {
            atualizarVisaoAberta((visao) => definirSinalDaConta(visao, moduloId, codigo, tipo));
            gravar(repo.visao.sinal(visaoAberta.id, moduloId, codigo, tipo));
          }}
          onVoltar={voltar}
        />
      );
    }

    if (tela === "configuracoes") {
      return exigirErp(
        <TelaConfiguracoes
          filiais={filiaisDoErpVisiveis}
          filiaisAtivas={filiaisAtivas}
          centros={centrosDoErpVisiveis}
          grupos={grupos}
          visoesContabeis={erp.visoesContabeis}
          onAbrir={(id) => navegar(id)}
        />
      );
    }

    if (tela === "grupos") {
      return (
        <TelaGrupos
          grupos={grupos}
          centros={centrosDoErpVisiveis}
          podeEditar={ehAdmin(sessao)}
          onAbrir={(id) => {
            setGrupoAbertoId(id);
            navegar("grupo");
          }}
          onNovo={novoGrupo}
          onExcluir={(grupo) =>
            setConfirmacao({ tipo: "grupo", id: grupo.id, nome: grupo.nome || "este grupo" })
          }
          onVoltar={() => navegar("configuracoes")}
        />
      );
    }

    if (tela === "grupo" && grupoAberto) {
      return exigirErp(
        <TelaGrupo
          grupo={grupoAberto}
          centros={centrosDoErpVisiveis}
          catalogo={contas.catalogo}
          visoesContabeis={erp.visoesContabeis}
          carregando={contas.carregando || erp.carregando}
          erro={contas.erro || erp.erro}
          onRecarregar={contas.recarregar}
          onTrocarVisaoContabil={trocarVisaoContabilDoGrupo}
          onSalvar={salvarGrupo}
          onVoltar={() => navegar("grupos")}
        />
      );
    }

    if (tela === "usuarios") {
      return exigirErp(
        <TelaUsuarios
          filiais={erp.filiais}
          centros={erp.centros}
          sessao={sessao}
          onVoltar={voltar}
        />
      );
    }

    if (TELAS_ERP.has(tela)) {
      return exigirErp(
        <TelaListaErp
          tela={tela}
          lista={tela === "filiais" ? filiaisDoErpVisiveis : centrosDoErpVisiveis}
          // Quais filiais o portal usa é configuração GLOBAL: muda o que todo
          // mundo vê. Quem não administra enxerga a lista e não mexe nela.
          somenteLeitura={!ehAdmin(sessao)}
          ativas={configuracao.filiaisAtivas}
          onAlternarAtiva={alternarFilialAtiva}
          onDefinirAtivas={definirFiliaisAtivas}
          onVoltar={voltar}
        />
      );
    }

    if (tela === "planos" || !planoAtivo) {
      return (
        <TelaPlanos
          planos={planos}
          visoes={visoes}
          podePublicar={ehAdmin(sessao)}
          mostrarInativos={mostrarInativos}
          onAbrir={abrirPlano}
          onNovo={() => setDrawerAberto(true)}
          onCopiar={pedirCopia}
          onAlternarSituacao={pedirSituacao}
          onAlternarInativos={() => setMostrarInativos((atual) => !atual)}
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
          centros={centrosPermitidosNaTela}
          contasDisponiveis={contasDisponiveis}
          receitasDisponiveis={receitasDisponiveis}
          totaisDasReceitas={totaisDasReceitas}
          filiaisIgnoradas={filiaisIgnoradas}
          filtros={filtros}
          onAlterarFiltro={alterarFiltro}
          linhas={linhasOrcamento}
          carregandoRealizado={realizado.carregando || contas.carregando}
          escopo={escopo}
          podeSincronizar={ehAdmin(sessao)}
          sincronizando={publicando === planoAtivo.id}
          onSincronizar={() => publicarNoLinx(planoAtivo.id)}
          podeLancar={podeLancar(sessao, {
            modulo: moduloDaTela.id,
            filial: filtros.filial,
            centro: filtros.centro,
            usaCentro: usaCentroDeCusto(visaoDoPlano, moduloDaTela.id),
          })}
          edicao={edicao}
          onVoltar={voltar}
        />
      );
    }

    if (tela === "dre") {
      return exigirErp(
        <TelaDre
          plano={planoAtivo}
          visao={visaoDoPlano}
          dre={dre}
          filiais={filiaisAtivas}
          filtroFilial={filtros.filial}
          onAlterarFiltroFilial={(filial) => alterarFiltro({ filial })}
          filiaisIgnoradas={filiaisIgnoradas}
          carregandoRealizado={realizado.carregando || contas.carregando}
          onAbrirModulo={abrirModulo}
          onVoltar={voltar}
        />
      );
    }

    return (
      <TelaHome
        plano={planoAtivo}
        visao={visaoDoPlano}
        modulosVisiveis={modulosVisiveis}
        podeVerDre={podeVerDre}
        onAbrirModulo={abrirModulo}
        onAbrirDre={() => abrirModulo("dre")}
        onVoltar={voltar}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        empresa={EMPRESA}
        badgeConfiguracoes={
          erp.carregando || erp.erro
            ? undefined
            : filiaisDoErpVisiveis.length + centrosDoErpVisiveis.length
        }
        planoAtivo={planoAtivo}
        visaoDoPlano={visaoDoPlano}
        modulosVisiveis={(lista) => modulosPermitidos(sessao, lista)}
        podeVerDre={podeVerDre}
        sessao={sessao}
        onSair={onSair}
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
        {/* Some ao fechar: publicar é ação pontual, e um aviso de sucesso que
            fica na tela vira ruído na próxima vez que alguém abrir os planos. */}
        {avisoPublicacao ? (
          <p className="aviso-fixo aviso-fixo--ok" role="status">
            {avisoPublicacao}
            <button type="button" className="botao-texto" onClick={() => setAvisoPublicacao("")}>
              Fechar
            </button>
          </p>
        ) : null}
        {/* O que ficou no navegador antes de o portal ter banco. Importar é
            decisão de quem está vendo: pode ser rascunho de outra pessoa na
            mesma máquina. */}
        {legado ? (
          <p className="aviso-fixo aviso-fixo--acao" role="status">
            <span>
              Este navegador tem {legado.visoes.length}{" "}
              {legado.visoes.length === 1 ? "visão" : "visões"} e {legado.planos.length}{" "}
              {legado.planos.length === 1 ? "plano" : "planos"} de antes da migração, que ainda não
              estão no banco.
            </span>
            <span className="aviso-fixo__botoes">
              <button type="button" className="botao botao--primario botao--compacto" onClick={importarLegado}>
                Importar para o banco
              </button>
              <button type="button" className="botao botao--secundario botao--compacto" onClick={() => setLegado(null)}>
                Agora não
              </button>
            </span>
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
          titulo={TITULO_CONFIRMACAO[confirmacao.tipo]}
          rotuloConfirmar={ROTULO_CONFIRMACAO[confirmacao.tipo]}
          verbo={confirmacao.tipo === "desativar" ? "desativar" : "excluir"}
          icone={confirmacao.tipo === "desativar" ? "archive" : "trash"}
          perigo={confirmacao.tipo !== "desativar"}
          onConfirmar={confirmarExclusao}
          onFechar={() => setConfirmacao(null)}
        />
      ) : null}
    </div>
  );
}
