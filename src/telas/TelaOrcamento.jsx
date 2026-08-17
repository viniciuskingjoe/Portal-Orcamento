import { useEffect, useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import EditorFormula from "../componentes/EditorFormula.jsx";
import TabelaOrcamento from "../componentes/TabelaOrcamento.jsx";
import Icone from "../componentes/Icone.jsx";
import Seletor from "../componentes/Seletor.jsx";
import { Carregando } from "../componentes/Estados.jsx";
import { DicaEdicao } from "../componentes/FiltrosOrcamento.jsx";
import { conta as buscarConta } from "../dados/contas.js";
import { GRUPOS } from "../dados/modulos.js";
import { chaveFuncionario } from "../dados/plano.js";
import { SEM_CENTRO, centrosDaFilial, contaEhCalculada, formulaDaConta } from "../dados/visao.js";
import { formatarMoeda } from "../lib/formato.js";

export const TODAS_AS_CONTAS = "__todas";

// Painel de seleção da lateral. Serve às contas do módulo, às receitas que dão
// base ao percentual e aos centros de custo — é a mesma interação, com rótulos
// diferentes, e ficar lado a lado é o que deixa as dimensões visíveis de uma vez.
//
// `acaoItem`, quando existe, some no "Total do módulo" (não é uma conta) e só
// se aplica ao painel de contas — hoje é o "⋮" de fixo/calculado de Despesas
// com pessoal. É opcional porque nenhum outro painel (receita, e os outros
// sete módulos) precisa dele.
function PainelSelecao({ titulo, descricao, rotuloTotal, valorTotal, itens, selecionado, aoSelecionar, vazio, acaoItem }) {
  return (
    <section className="painel-selecao">
      <h3>{titulo}</h3>
      {descricao ? <p className="painel-selecao__descricao">{descricao}</p> : null}

      <button
        type="button"
        className={`selecao-item ${selecionado === valorTotal ? "is-active" : ""}`}
        aria-pressed={selecionado === valorTotal}
        onClick={() => aoSelecionar(valorTotal)}
      >
        <span>{rotuloTotal}</span>
        <b>{itens.length}</b>
      </button>

      {itens.map((item) => {
        const ativo = selecionado === item.codigo;
        const conteudo = (
          <>
            <code>{item.codigo}</code>
            <span>{item.descricao}</span>
            {/* O planejado da receita é a base do percentual: mostrá-lo aqui
                evita sair da tela para descobrir sobre quanto ele incide. */}
            {item.valor != null ? (
              <em className={item.valor ? "" : "is-zerado"}>{formatarMoeda(item.valor)}</em>
            ) : null}
          </>
        );

        // Só quando há ação por item o layout muda: o botão de selecionar a
        // conta some de um `<button>` único para um `<div>` com dois
        // controles (selecionar + "⋮") — dois botões não cabem um dentro do
        // outro. Sem `acaoItem` é exatamente o de sempre, para não arriscar
        // o visual dos outros sete módulos.
        if (!acaoItem) {
          return (
            <button
              type="button"
              key={item.codigo}
              className={`selecao-item selecao-item--conta ${ativo ? "is-active" : ""}`}
              aria-pressed={ativo}
              onClick={() => aoSelecionar(item.codigo)}
              title={item.descricao ?? item.codigo}
            >
              {conteudo}
            </button>
          );
        }

        return (
          <div
            key={item.codigo}
            className={`selecao-item selecao-item--conta tem-acao ${ativo ? "is-active" : ""}`}
          >
            <button
              type="button"
              className="selecao-item__selecionar"
              aria-pressed={ativo}
              onClick={() => aoSelecionar(item.codigo)}
              title={item.descricao ?? item.codigo}
            >
              {conteudo}
            </button>
            {acaoItem(item)}
          </div>
        );
      })}

      {!itens.length ? <p className="sem-contas">{vazio}</p> : null}
    </section>
  );
}

export default function TelaOrcamento({
  plano,
  visao,
  modulo,
  catalogo,
  filiais,
  centros,
  contasDisponiveis,
  receitasDisponiveis,
  totaisDasReceitas,
  filtros,
  onAlterarFiltro,
  escopo,
  podeLancar = true,
  podeSincronizar = false,
  sincronizando = false,
  onSincronizar,
  linhas,
  carregandoRealizado,
  edicao,
  onGravarFuncionarios,
  onDefinirFormula,
  // Avisa o App que há edição local em andamento aqui dentro (célula de Nº de
  // funcionários, ou o editor de fórmula aberto) — sem isto, a atualização de
  // fundo (a cada minuto, ou quando a aba volta o foco) não sabia e podia
  // trazer o valor antigo por cima no meio da digitação, porque `editingCell`
  // só cobre a célula de reais.
  onEdicaoAuxiliarMudou,
  onVoltar,
}) {
  const grupo = GRUPOS[modulo.grupo];
  const percentual = modulo.percentual === true;
  const temFuncionarios = modulo.comFuncionarios === true;

  // Código da conta cujo "⋮" foi clicado — não precisa ser a conta
  // selecionada na tabela; qualquer conta da lista pode virar fixa/calculada
  // sem trocar o que está em tela.
  const [editandoFormulaDe, setEditandoFormulaDe] = useState(null);
  const [funcEmEdicao, setFuncEmEdicao] = useState(false);

  useEffect(() => {
    onEdicaoAuxiliarMudou?.(editandoFormulaDe != null || funcEmEdicao);
    // Trocar de módulo desmonta esta tela — sem isto, sair com o editor de
    // fórmula ou a célula de funcionários abertos deixava a flag travada e a
    // atualização de fundo parava para o app inteiro, não só para esta tela.
    return () => onEdicaoAuxiliarMudou?.(false);
  }, [editandoFormulaDe, funcEmEdicao, onEdicaoAuxiliarMudou]);

  // Percentual sobre receita zero não vira valor nenhum. Sem dizer isso, a
  // coluna em reais fica em 0,00 com o percentual digitado ao lado, e parece
  // que a digitação não pegou.
  const totalDaTabela = linhas.find((linha) => linha.id === "total");
  const semBase = percentual && !totalDaTabela?.base;

  // Receita escolhida que não recebe realizado nenhum. Sem explicar, a coluna
  // zerada ao lado de um planejado cheio parece cálculo errado — e não é: o ERP
  // não marca a receita no lançamento.
  const receitaSemRealizado =
    percentual &&
    filtros.receita !== TODAS_AS_CONTAS &&
    !totalDaTabela?.realizado &&
    !totalDaTabela?.anterior;

  const receitas = percentual ? (receitasDisponiveis ?? []) : [];

  // Centros que a VISÃO deu a esta filial neste módulo — não os 37 do ERP.
  // Oferecer centro que a visão não configurou leva a escolher um e encontrar a
  // tela vazia, sem dizer por quê.
  //
  // Em "Total" é a união dos centros das filiais em uso: ver um centro em todas
  // as filiais de uma vez é leitura legítima.
  //
  // Fica ANTES de `podeEditar` e `motivo` porque os dois o leem. `const` não é
  // içado com valor: declarado depois, a leitura cai na zona morta temporal e
  // derruba a tela inteira em branco, sem erro visível.
  const centrosDaVisao = useMemo(() => {
    const doModulo = new Set();
    const alvo =
      filtros.filial === "total" ? filiais.map((filial) => filial.id) : [filtros.filial];

    alvo.forEach((filialId) =>
      centrosDaFilial(visao, modulo.id, filialId).forEach((centro) => doModulo.add(centro))
    );

    // Percorre `centros` (já recortado pela permissão) para herdar a ordem e o
    // nome do ERP em vez de mostrar códigos soltos.
    return (centros ?? []).filter((centro) => doModulo.has(centro.id));
  }, [visao, modulo.id, filtros.filial, filiais, centros]);

  // Editar só faz sentido em uma célula única: uma filial e uma conta — e, no
  // módulo percentual, também uma receita: o mesmo percentual vale valores
  // diferentes conforme a receita sobre a qual incide.
  const podeEditar =
    podeLancar &&
    filtros.filial !== "total" &&
    filtros.conta !== TODAS_AS_CONTAS &&
    contasDisponiveis.length > 0 &&
    filtros.centro !== SEM_CENTRO &&
    (!percentual || (filtros.receita !== TODAS_AS_CONTAS && receitas.length > 0));

  // Nº de funcionários é do CENTRO, não da conta: aparece mesmo vendo "Total
  // do módulo" (soma das contas), porque a multiplicação distribui — Σ(valor
  // da conta) × gente = Σ(valor da conta × gente). Só precisa de filial e
  // centro únicos.
  const podeMostrarFuncionarios =
    temFuncionarios && filtros.filial !== "total" && filtros.centro !== SEM_CENTRO;
  const podeEditarFuncionarios =
    podeLancar && filtros.filial !== "total" && filtros.centro !== SEM_CENTRO;
  const contaCalculada =
    temFuncionarios && filtros.conta !== TODAS_AS_CONTAS && contaEhCalculada(visao, modulo.id, filtros.conta);

  const motivo = !podeLancar && filtros.filial !== "total"
    ? "Você tem acesso de leitura nesta combinação — os valores aparecem, mas não podem ser alterados."
    : !contasDisponiveis.length
    ? "Nenhuma conta configurada para esta combinação. Ajuste a visão."
    : percentual && !receitas.length
      ? "Nenhuma conta de receita configurada nesta filial. Ajuste Receita de vendas na visão."
      : filtros.filial === "total"
        ? "Para lançar, escolha uma filial específica."
        : !centrosDaVisao.length
          ? "Esta filial não tem centro de custo nesta visão. Marque os centros dela em Visões."
          : filtros.centro === SEM_CENTRO
            ? "Escolha um centro de custo acima — o Total é só leitura."
            : filtros.conta === TODAS_AS_CONTAS
              ? "Escolha uma conta na lista à esquerda para lançar o planejado."
              : percentual && filtros.receita === TODAS_AS_CONTAS
                ? "Escolha também a receita sobre a qual o percentual incide."
                // Pronto para lançar não precisa de aviso: a faixa só existe
                // para dizer o que FALTA. Explicar o teclado a cada tela era
                // ocupar espaço fixo com algo que se aprende na primeira vez.
                : null;

  // As dimensões que compõem a célula, na ordem em que se escolhe: sobre o quê
  // (receita) e o quê (conta do módulo). Filial e centro ficam nos seletores do
  // topo — são o recorte, não o conteúdo.
  const paineis = [];

  if (percentual) {
    paineis.push({
      titulo: "Receita (base do %)",
      descricao: `Planejado de ${plano.ano} — é sobre este valor que o percentual incide.`,
      rotuloTotal: "Todas as receitas",
      valorTotal: TODAS_AS_CONTAS,
      itens: receitas.map((codigo) => ({
        codigo,
        descricao: buscarConta(catalogo, codigo)?.descricao ?? "conta fora da visão contábil",
        valor: totaisDasReceitas?.get(codigo) ?? 0,
      })),
      selecionado: filtros.receita,
      aoSelecionar: (codigo) => onAlterarFiltro({ receita: codigo }),
      vazio: "Nenhuma receita configurada para esta filial na visão.",
    });
  }

  paineis.push({
    titulo: "Contas do módulo",
    rotuloTotal: "Total do módulo",
    valorTotal: TODAS_AS_CONTAS,
    itens: contasDisponiveis.map((codigo) => ({
      codigo,
      descricao: buscarConta(catalogo, codigo)?.descricao ?? "conta fora da visão contábil",
    })),
    selecionado: filtros.conta,
    aoSelecionar: (codigo) => onAlterarFiltro({ conta: codigo }),
    vazio: "Nenhuma conta neste centro. Escolha as contas dele em Visões.",
    // Só Despesas com pessoal ganha o "⋮": fixo é o padrão de todo módulo, e
    // só aqui existe a opção de virar calculado.
    acaoItem:
      temFuncionarios && onDefinirFormula
        ? (item) => (
            <button
              type="button"
              className="selecao-item__acao"
              onClick={() => setEditandoFormulaDe(item.codigo)}
              title="Escolher se esta conta é valor fixo ou calculado por fórmula"
              aria-label={`Fixo ou calculado — ${item.codigo}`}
            >
              <Icone nome="maisVertical" tamanho={14} />
            </button>
          )
        : undefined,
  });

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo={modulo.titulo}
        subtitulo={`${plano.nome} · ${plano.ano} · visão ${visao.nome}`}
        onVoltar={onVoltar}
      />

      <div className="filtros-orcamento">
        <label>
          <span>Filial</span>
          {/* "Total" é o total das filiais EM USO, não do ERP inteiro. Dizer
              "todas" faria o número parecer errado contra qualquer relatório que
              não filtre filial. */}
          <Seletor
            valor={filtros.filial}
            opcoes={[
              {
                valor: "total",
                rotulo: `Total — ${filiais.length} ${filiais.length === 1 ? "filial em uso" : "filiais em uso"}`,
              },
              ...filiais.map((filial) => ({ valor: filial.id, rotulo: filial.nome })),
            ]}
            aoEscolher={(valor) => onAlterarFiltro({ filial: valor })}
            buscaVazia="Nenhuma filial com esse nome."
          />
        </label>

        {/* Ao lado da filial porque é a mesma natureza de escolha: recortar o
            que a tabela mostra. Só os centros que a visão deu a esta filial —
            oferecer os 37 do ERP levaria a escolher um e achar a tela vazia. */}
        <label>
          <span>Centro de custo</span>
          <Seletor
            valor={filtros.centro}
            opcoes={[
              {
                valor: SEM_CENTRO,
                rotulo: centrosDaVisao.length
                  ? `Total — ${centrosDaVisao.length} ${centrosDaVisao.length === 1 ? "centro" : "centros"}`
                  : "Nenhum centro nesta filial",
              },
              ...centrosDaVisao.map((centro) => ({
                valor: centro.id,
                rotulo: centro.nome,
                detalhe: centro.id,
              })),
            ]}
            aoEscolher={(valor) => onAlterarFiltro({ centro: valor })}
            buscaVazia="Nenhum centro com esse nome."
          />
        </label>

        {/* O ano é o do plano — não há o que escolher, então o campo ocupa só o
            que precisa em vez da largura de um select. */}
        <label className="filtro-ano">
          <span>Ano</span>
          <output className="campo-fixo">
            {plano.ano}
            <span className={`chip chip--${grupo?.chip ?? "receita"}`}>{modulo.grupo}</span>
          </output>
        </label>

        {/* O recorte de quem está vendo, quando não é tudo. */}
        {escopo ? (
          <label>
            <span>Seu acesso</span>
            <output className="campo-fixo">{escopo}</output>
          </label>
        ) : null}

        {/* A dica fecha a linha dos filtros: é sobre o que falta escolher neles. */}
        <DicaEdicao>{motivo}</DicaEdicao>

        {/* Digitar já grava no portal — este botão é outra coisa: manda o
            planejado para o orçamento do Linx, de onde o Power BI lê. Daí o
            nome dizer "no Linx" e não "salvar", que faria parecer que sem
            clicar se perde o que foi digitado.

            Grava o PLANO INTEIRO, não só este módulo: a tabela do ERP tem
            chave filial · centro · classificação · mês e não guarda de que
            módulo a linha veio, então publicação parcial não é expressável
            lá. A confirmação diz isso. */}
        {podeSincronizar ? (
          <button
            type="button"
            className="botao botao--primario botao-sincronizar"
            onClick={onSincronizar}
            disabled={sincronizando}
            title="Deixa o orçamento deste plano no Linx igual ao que está aqui"
          >
            <Icone nome="sincronizar" tamanho={15} />
            {sincronizando ? "Sincronizando…" : "Sincronizar com o Linx"}
          </button>
        ) : null}
      </div>

      {carregandoRealizado ? <Carregando texto="Carregando realizado do ERP…" /> : null}

      {/* Os avisos ficam ACIMA do layout de duas colunas, não dentro da coluna
          da direita: dentro dela empurravam a tabela para baixo e o cabeçalho
          não nascia na mesma linha que os painéis. */}
      {semBase ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          <span>
            Este módulo é lançado em percentual sobre a receita de vendas planejada, e não há receita
            planejada para {filtros.filial === "total" ? "estas filiais" : "esta filial"} em{" "}
            {plano.ano}. Enquanto isso, a coluna em reais fica zerada. Lance Receita de vendas
            primeiro.
          </span>
        </p>
      ) : null}

      {receitaSemRealizado ? (
        <p className="modulo-aviso">
          <Icone nome="info" tamanho={16} />
          <span>
            Sem realizado nesta receita. O ERP não marca a receita no lançamento — a atribuição vem
            do centro de custo, como no Scoreplan: <strong>020</strong> é e-commerce e todo o resto é
            coleção. As demais receitas ficam sem realizado até o ERP passar a identificá-las.
          </span>
        </p>
      ) : null}

      <div className="orcamento-layout" data-paineis={paineis.length}>
        {/* Painéis lado a lado, como no Scoreplan: as dimensões que compõem a
            célula ficam visíveis de uma vez, sem rolar de uma para a outra. Só
            contas analíticas — as sintéticas não recebem lançamento. */}
        <aside className="orcamento-lateral">
          {paineis.map((painel) => (
            <PainelSelecao key={painel.titulo} {...painel} />
          ))}
        </aside>

        <section className="orcamento-dados">
          <TabelaOrcamento
            linhas={linhas}
            percentual={percentual}
            podeEditar={podeEditar && !contaCalculada}
            prefixoCelula={`${modulo.id}|${filtros.filial}|${filtros.centro}|${filtros.conta}|${filtros.receita}`}
            colunaFuncionarios={
              podeMostrarFuncionarios
                ? {
                    obterValor: (mes) =>
                      plano.funcionarios?.[chaveFuncionario(filtros.filial, filtros.centro, mes)] ?? null,
                    podeEditar: podeEditarFuncionarios,
                    onGravar: (celulas) =>
                      onGravarFuncionarios?.(
                        celulas.map((celula) => ({
                          ...celula,
                          filial: filtros.filial,
                          centro: filtros.centro,
                        }))
                      ),
                  }
                : undefined
            }
            onFuncionariosEmEdicao={setFuncEmEdicao}
            {...edicao}
          />
        </section>
      </div>

      {editandoFormulaDe ? (
        <EditorFormula
          conta={editandoFormulaDe}
          descricao={buscarConta(catalogo, editandoFormulaDe)?.descricao ?? ""}
          contasDisponiveis={contasDisponiveis
            .filter((codigo) => codigo !== editandoFormulaDe)
            .map((codigo) => ({
              codigo,
              descricao: buscarConta(catalogo, codigo)?.descricao ?? codigo,
            }))}
          formulaAtual={formulaDaConta(visao, modulo.id, editandoFormulaDe)}
          onSalvar={(expressao) => onDefinirFormula(editandoFormulaDe, expressao)}
          onFechar={() => setEditandoFormulaDe(null)}
        />
      ) : null}
    </main>
  );
}
