import { useMemo, useState } from "react";

import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import Icone from "../componentes/Icone.jsx";
import Modal from "../componentes/Modal.jsx";
import ModalConfirmacao from "../componentes/ModalConfirmacao.jsx";
import Seletor from "../componentes/Seletor.jsx";
import {
  conta as buscarConta,
  filtrarPorCodigos,
  filtrarPorGrupo,
  filtrarPorPrefixos,
} from "../dados/contas.js";
import { TOTAL_MODULO_TOKEN } from "../dados/dre.js";
import { validarFormula } from "../dados/formula.js";
import { MODULOS, modulo as definicaoDoModulo } from "../dados/modulos.js";
import { contasDaFilial, dreLinhasOrdenadas, filiaisDoModulo } from "../dados/visao.js";

// ============================================================================
// CONFIGURAÇÃO DO DRE
//
// O DRE existiu antes com uma linha fixa por módulo (removido de propósito —
// ver dados/dre.js). Aqui cada linha decide de onde vem: um recorte de contas
// de UM módulo, ou uma fórmula que soma/subtrai outras linhas. Mesmo espírito
// de TelaVisaoModulo.jsx (árvore de contas em cascata), só que a seleção não
// é por filial/centro — é global à visão, porque a linha do DRE não lança
// nada, só lê o que os módulos já orçam.
// ============================================================================

function gerarId() {
  return `dre-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Códigos que o módulo já usa nesta visão — união de todas as filiais. Usado
// tanto pra recortar a árvore de contas quando a linha é "módulo" quanto
// pra listar contas clicáveis na fórmula (V[código], qualquer módulo).
function codigosConfiguradosDoModulo(visao, moduloId) {
  if (!visao || !moduloId) return [];
  const codigos = new Set();
  filiaisDoModulo(visao, moduloId).forEach((filialId) => {
    contasDaFilial(visao, moduloId, filialId).forEach((codigo) => codigos.add(codigo));
  });
  return [...codigos];
}

// Sem nenhuma conta configurada ainda pro módulo (visão nova), cai no grupo
// contábil inteiro — melhor mostrar demais do que nada.
function catalogoDoRecorte(catalogo, moduloDefinicao, codigosConfigurados) {
  if (!moduloDefinicao) return catalogo;
  if (codigosConfigurados.length) return filtrarPorCodigos(catalogo, codigosConfigurados);
  return filtrarPorPrefixos(filtrarPorGrupo(catalogo, moduloDefinicao.grupo), moduloDefinicao.prefixos);
}

// Reordenar sem arrastar: dois botões por linha bastam para qualquer ordem
// final, e não exigem tratar pointer/drag events — mais simples de manter e
// funciona por teclado, o que um handle de arrasto sozinho não dá de graça.
function BotoesMover({ podeSubir, podeDescer, onSubir, onDescer }) {
  return (
    <span className="dre-linha__mover">
      <button
        type="button"
        className="botao-icone"
        onClick={onSubir}
        disabled={!podeSubir}
        aria-label="Mover para cima"
        title="Mover para cima"
      >
        <Icone nome="chevron" tamanho={13} />
      </button>
      <button
        type="button"
        className="botao-icone botao-icone--baixo"
        onClick={onDescer}
        disabled={!podeDescer}
        aria-label="Mover para baixo"
        title="Mover para baixo"
      >
        <Icone nome="chevron" tamanho={13} />
      </button>
    </span>
  );
}

// Modal de criar/editar uma linha. `linhasExistentes` serve pra: (a) listar
// quem uma fórmula pode referenciar e (b) impedir duas linhas com a mesma
// base de análise vertical / linha principal ao mesmo tempo (a tela desliga a
// marca da anterior antes de gravar a nova — mesma garantia que o servidor
// faz por conta própria, ver server/repositorio.js `salvarLinhaDre`).
function EditorLinhaDre({ linha, linhasExistentes, catalogo, visao, onSalvar, onFechar }) {
  const [titulo, setTitulo] = useState(linha?.titulo ?? "");
  const [origem, setOrigem] = useState(linha?.origem ?? "modulo");
  const [moduloId, setModuloId] = useState(linha?.moduloId ?? MODULOS[0]?.id ?? "");
  const [sinal, setSinalBruto] = useState(linha?.sinal ?? 1);
  const [valores, setValores] = useState(() => linha?.valores ?? []);
  const [contaParaAdicionar, setContaParaAdicionar] = useState("");

  // Testado na tela: sinal por conta era complexidade sem uso — quase toda
  // linha só soma tudo que escolhe, então o sinal virou UM só pra linha
  // inteira (o toggle abaixo), com ou sem recorte. Trocar o sinal aqui
  // também vira as contas já escolhidas: sem isso, uma conta marcada com
  // + antes de trocar pra "subtrai" ficaria com o sinal antigo escondido —
  // não tem mais onde ver ou corrigir individualmente.
  function setSinal(novoSinal) {
    setSinalBruto(novoSinal);
    setValores((atuais) => atuais.map((item) => ({ ...item, sinal: novoSinal })));
  }
  const [formula, setFormula] = useState(linha?.formula ?? "");
  const [unidade, setUnidade] = useState(linha?.unidade ?? "moeda");
  const [mostra, setMostra] = useState(linha?.mostra !== false);
  const [destaca, setDestaca] = useState(linha?.destaca === true);
  const [baseAnaliseVertical, setBaseAnaliseVertical] = useState(linha?.baseAnaliseVertical === true);
  const [linhaPrincipal, setLinhaPrincipal] = useState(linha?.linhaPrincipal === true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const moduloEscolhido = definicaoDoModulo(moduloId);

  // As contas que o módulo já tem nesta visão — porque o grupo contábil
  // sozinho é largo demais: "Deduções de vendas" e "Custos variáveis"
  // dividem o mesmo grupo DV, então filtrar só por grupo misturaria as duas.
  const codigosDoModulo = useMemo(() => codigosConfiguradosDoModulo(visao, moduloEscolhido?.id), [visao, moduloEscolhido]);
  const catalogoDoModulo = useMemo(
    () => catalogoDoRecorte(catalogo, moduloEscolhido, codigosDoModulo),
    [catalogo, moduloEscolhido, codigosDoModulo]
  );

  // Fórmula também referencia conta direto (V[código], não só L[linha]) —
  // este é o módulo escolhido só pra listar contas clicáveis; a fórmula em
  // si acha sozinha em qual módulo cada V[código] mora (dados/dre.js).
  const [moduloReferenciaId, setModuloReferenciaId] = useState(MODULOS[0]?.id ?? "");
  const moduloReferencia = definicaoDoModulo(moduloReferenciaId);
  const codigosDaReferencia = useMemo(
    () => codigosConfiguradosDoModulo(visao, moduloReferencia?.id),
    [visao, moduloReferencia]
  );
  const catalogoDaReferencia = useMemo(
    () => catalogoDoRecorte(catalogo, moduloReferencia, codigosDaReferencia),
    [catalogo, moduloReferencia, codigosDaReferencia]
  );
  const contasParaReferenciar = useMemo(
    () => catalogoDaReferencia.lista.filter((item) => item.sintetica === false),
    [catalogoDaReferencia]
  );

  // Escolha simples — uma conta por vez, não em árvore — porque a linha do
  // DRE não recorta por hierarquia, recorta a lista final que vai somar (ou
  // subtrair) no resultado. Só as analíticas: sintética não recebe
  // lançamento, então também não tem o que somar. As já escolhidas somem do
  // seletor — escolher de novo não faz nada, então nem aparece.
  const escolhidas = new Set(valores.map((item) => item.codigo));
  const opcoesConta = useMemo(() => {
    const contas = catalogoDoModulo.lista
      .filter((item) => item.sintetica === false && !escolhidas.has(item.codigo))
      .map((item) => ({ valor: item.codigo, rotulo: item.descricao, detalhe: item.codigo }));
    // "Total" vai primeiro na lista — atalho pra escolher todas as contas
    // do módulo de uma vez, sem marcar uma por uma.
    if (escolhidas.has(TOTAL_MODULO_TOKEN)) return contas;
    return [{ valor: TOTAL_MODULO_TOKEN, rotulo: "Total — todas as contas do módulo" }, ...contas];
  }, [catalogoDoModulo, valores]); // eslint-disable-line react-hooks/exhaustive-deps

  function adicionarValor() {
    if (!contaParaAdicionar) return;
    setValores((atuais) => [...atuais, { codigo: contaParaAdicionar, sinal }]);
    setContaParaAdicionar("");
  }

  function removerValor(codigo) {
    setValores((atuais) => atuais.filter((item) => item.codigo !== codigo));
  }

  const referenciasDisponiveis = linhasExistentes.filter((item) => item.id !== linha?.id);
  const erroFormula = origem === "formula" && formula.trim() ? validarFormula(formula) : null;

  async function salvar() {
    if (!titulo.trim()) return setErro("Dá um nome pra essa linha.");
    if (origem === "formula" && !formula.trim()) return setErro("Escreve a fórmula, ou troca pra Módulo.");
    if (origem === "formula" && erroFormula) return setErro(erroFormula);
    if (origem === "modulo" && !moduloId) return setErro("Escolhe de qual módulo esta linha vem.");

    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        id: linha?.id ?? gerarId(),
        ordem: linha?.ordem ?? linhasExistentes.length,
        titulo: titulo.trim(),
        origem,
        moduloId: origem === "modulo" ? moduloId : null,
        sinal: origem === "modulo" ? sinal : null,
        valores: origem === "modulo" ? valores : [],
        formula: origem === "formula" ? formula.trim() : null,
        mostra,
        destaca,
        baseAnaliseVertical,
        linhaPrincipal,
        unidade: origem === "formula" ? unidade : "moeda",
      });
      onFechar();
    } catch (falha) {
      setErro(falha?.message ?? "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={linha ? "Editar linha" : "Nova linha"} onFechar={onFechar} largura="720px">
      <div className="modal__conteudo">
        <label className="campo">
          <span>Descrição</span>
          <input
            className="campo-fixo campo-fixo--editavel"
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
            placeholder="Ex.: Receita líquida"
            autoFocus
          />
        </label>

        <div className="abas" role="group" aria-label="De onde vem o valor">
          <button type="button" className={origem === "modulo" ? "is-active" : ""} onClick={() => setOrigem("modulo")}>
            Módulo
          </button>
          <button type="button" className={origem === "formula" ? "is-active" : ""} onClick={() => setOrigem("formula")}>
            Fórmula
          </button>
        </div>

        {origem === "modulo" ? (
          <>
            <div className="campos-duplos">
              <label className="campo">
                <span>Módulo</span>
                <Seletor
                  valor={moduloId}
                  opcoes={MODULOS.map((item) => ({ valor: item.id, rotulo: item.titulo }))}
                  aoEscolher={(valor) => {
                    setModuloId(valor);
                    setValores([]);
                  }}
                  buscaVazia="Nenhum módulo com esse nome."
                />
              </label>
              <label className="campo">
                <span>Sinal</span>
                <div className="abas" role="group" aria-label="Sinal da linha">
                  <button type="button" className={sinal === 1 ? "is-active" : ""} onClick={() => setSinal(1)}>
                    + soma
                  </button>
                  <button type="button" className={sinal === -1 ? "is-active" : ""} onClick={() => setSinal(-1)}>
                    − subtrai
                  </button>
                </div>
              </label>
            </div>

            <p className="campo__ajuda">
              {codigosDoModulo.length
                ? `Contas que ${moduloEscolhido?.titulo} já usa nesta visão`
                : `${moduloEscolhido?.titulo} ainda não tem conta configurada nesta visão — mostrando o grupo contábil inteiro`}{" "}
              — escolhe as contas desta linha, ou deixa vazio pra somar o módulo inteiro. O sinal
              acima vale pra linha toda.
            </p>

            <div className="contas-seletor">
              <div className="contas-seletor__topo">
                <span>
                  Contas desta linha
                  <small className="contas-seletor__origem">
                    {valores.length
                      ? `${valores.length} escolhida${valores.length === 1 ? "" : "s"}`
                      : "nenhuma — soma o módulo inteiro"}
                  </small>
                </span>
                <button type="button" className="botao-texto" onClick={() => setValores([])} disabled={!valores.length}>
                  Limpar
                </button>
              </div>

              <div className="valores-linha__adicionar">
                <Seletor
                  valor={contaParaAdicionar}
                  opcoes={opcoesConta}
                  aoEscolher={setContaParaAdicionar}
                  placeholder="Escolher conta…"
                  buscaVazia="Nenhuma conta com esse nome."
                />
                <Botao onClick={adicionarValor} disabled={!contaParaAdicionar}>
                  <Icone nome="plus" tamanho={15} />
                  Adicionar
                </Botao>
              </div>

              <ul className="valores-linha__lista">
                {valores.map((item) => (
                  <li key={item.codigo} className="valores-linha__item">
                    <span className="valores-linha__conta">
                      {item.codigo === TOTAL_MODULO_TOKEN ? (
                        <strong>Total — todas as contas do módulo</strong>
                      ) : (
                        <>
                          <code>{item.codigo}</code>
                          {buscarConta(catalogo, item.codigo)?.descricao ?? ""}
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      className="botao-icone botao-icone--perigo"
                      onClick={() => removerValor(item.codigo)}
                      title="Remover"
                    >
                      <Icone nome="trash" tamanho={14} />
                    </button>
                  </li>
                ))}
                {!valores.length ? <p className="sem-contas">Nenhuma conta escolhida ainda.</p> : null}
              </ul>
            </div>
          </>
        ) : (
          <>
            <p className="campo__ajuda">
              Soma ou subtrai outras linhas deste demonstrativo (<code>L[código]</code>) ou contas
              direto de qualquer módulo (<code>V[código]</code>), ex.: <code>L[receita]-L[deducao]</code>.
              Referenciar uma conta que já entra numa linha "módulo" soma ela duas vezes — confere
              antes de salvar.
            </p>
            <label className="campo">
              <span>Fórmula</span>
              <textarea
                rows={3}
                value={formula}
                onChange={(evento) => setFormula(evento.target.value)}
                placeholder="Ex: L[receita]-L[deducao]"
                aria-invalid={erroFormula ? "true" : "false"}
              />
            </label>
            {erroFormula ? <p className="erro-campo">{erroFormula}</p> : null}

            <label className="campo">
              <span>Formato</span>
              <div className="abas" role="group" aria-label="Formato do valor calculado">
                <button type="button" className={unidade === "moeda" ? "is-active" : ""} onClick={() => setUnidade("moeda")}>
                  Valor (R$)
                </button>
                <button
                  type="button"
                  className={unidade === "percentual" ? "is-active" : ""}
                  onClick={() => setUnidade("percentual")}
                >
                  Percentual (%)
                </button>
              </div>
            </label>
            {unidade === "percentual" ? (
              <p className="campo__ajuda">
                A fórmula já deve devolver o percentual pronto — ex.:{" "}
                <code>L[deducao]/L[receita-liquida]*100</code>. A linha aparece na leitura como % , não
                como R$.
              </p>
            ) : null}

            {referenciasDisponiveis.length ? (
              <div className="editor-formula__referencias">
                <span>Linhas para referenciar</span>
                <div className="editor-formula__lista">
                  {referenciasDisponiveis.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="botao-texto"
                      title={item.titulo}
                      onClick={() =>
                        setFormula((atual) => `${atual}${atual.trim() ? " " : ""}L[${item.id}]`)
                      }
                    >
                      <code>{item.id}</code> {item.titulo}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="sem-contas">Nenhuma outra linha ainda — cria as de baixo primeiro.</p>
            )}

            <div className="editor-formula__referencias">
              <span>Contas para referenciar</span>
              <label className="campo">
                <span>Módulo</span>
                <Seletor
                  valor={moduloReferenciaId}
                  opcoes={MODULOS.map((item) => ({ valor: item.id, rotulo: item.titulo }))}
                  aoEscolher={setModuloReferenciaId}
                  buscaVazia="Nenhum módulo com esse nome."
                />
              </label>
              <div className="editor-formula__lista">
                {contasParaReferenciar.length ? (
                  contasParaReferenciar.map((item) => (
                    <button
                      type="button"
                      key={item.codigo}
                      className="botao-texto"
                      title={item.descricao}
                      onClick={() =>
                        setFormula((atual) => `${atual}${atual.trim() ? " " : ""}V[${item.codigo}]`)
                      }
                    >
                      <code>{item.codigo}</code> {item.descricao}
                    </button>
                  ))
                ) : (
                  <p className="sem-contas">{moduloReferencia?.titulo} não tem conta nesta visão ainda.</p>
                )}
              </div>
            </div>
          </>
        )}

        <div className="campos-duplos">
          <label className="check-inline">
            <input type="checkbox" checked={mostra} onChange={(evento) => setMostra(evento.target.checked)} />
            <span className="checkbox-visual">
              <Icone nome="check" tamanho={13} />
            </span>
            Mostra no demonstrativo
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={destaca} onChange={(evento) => setDestaca(evento.target.checked)} />
            <span className="checkbox-visual">
              <Icone nome="check" tamanho={13} />
            </span>
            Destaca (negrito)
          </label>
          <label className="check-inline" title="Denominador do % de todas as linhas. Só uma por visão.">
            <input
              type="checkbox"
              checked={baseAnaliseVertical}
              onChange={(evento) => setBaseAnaliseVertical(evento.target.checked)}
            />
            <span className="checkbox-visual">
              <Icone nome="check" tamanho={13} />
            </span>
            Base da análise vertical
          </label>
          <label className="check-inline" title="O resultado final do demonstrativo. Só uma por visão.">
            <input
              type="checkbox"
              checked={linhaPrincipal}
              onChange={(evento) => setLinhaPrincipal(evento.target.checked)}
            />
            <span className="checkbox-visual">
              <Icone nome="check" tamanho={13} />
            </span>
            Linha principal (resultado)
          </label>
        </div>

        {erro ? <p className="erro-campo">{erro}</p> : null}
      </div>

      <div className="modal__rodape">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
      </div>
    </Modal>
  );
}

export default function TelaDreConfig({
  visao,
  catalogo,
  carregando,
  erro,
  onRecarregar,
  onDefinirLinha,
  onRemoverLinha,
  onReordenar,
  onVoltar,
}) {
  const [editando, setEditando] = useState(null); // linha (edição) ou {} (nova) ou null
  const [aExcluir, setAExcluir] = useState(null);

  const linhas = dreLinhasOrdenadas(visao);

  function mover(indice, deslocamento) {
    const alvo = indice + deslocamento;
    if (alvo < 0 || alvo >= linhas.length) return;
    const ordem = linhas.map((item) => item.id);
    [ordem[indice], ordem[alvo]] = [ordem[alvo], ordem[indice]];
    onReordenar(ordem);
  }

  return (
    <main className="conteudo">
      <Cabecalho
        titulo="DRE"
        subtitulo={`Visão ${visao.nome} · linhas do demonstrativo`}
        onVoltar={onVoltar}
        acao={
          <Botao onClick={() => setEditando({})}>
            <Icone nome="plus" tamanho={18} />
            Nova linha
          </Botao>
        }
      />

      {carregando ? <Carregando texto="Carregando plano de contas…" /> : null}
      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={onRecarregar} /> : null}

      {!carregando && !erro ? (
        <div className="tabela-wrap">
          <table className="tabela-orcamento tabela-dre">
            <thead>
              <tr>
                <th scope="col">Descrição</th>
                <th scope="col">Origem</th>
                <th scope="col">Mostra</th>
                <th scope="col">Destaca</th>
                <th scope="col" aria-label="Mover" />
                <th scope="col" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, indice) => (
                <tr key={linha.id} className={linha.destaca ? "linha-dre--destaque" : ""}>
                  <th scope="row">
                    {/* Sinal é a decisão de maior consequência da linha (quem
                        vira dedução do resultado) — só marca o "−" (o caso
                        que precisa de atenção); "+" é o padrão silencioso,
                        mesmo espírito de mostrarAbsoluto em dados/dre.js. */}
                    {linha.origem === "modulo" && linha.sinal === -1 ? (
                      <span className="dre-linha__sinal-lista" title="Entra como dedução no resultado">
                        −
                      </span>
                    ) : null}
                    {linha.titulo}
                    {linha.baseAnaliseVertical ? <span className="chip chip--edicao">Base % vertical</span> : null}
                    {linha.linhaPrincipal ? <span className="chip chip--edicao">Linha principal</span> : null}
                  </th>
                  <td>
                    {linha.origem === "formula" ? (
                      <>
                        {linha.unidade === "percentual" ? "Fórmula (%)" : "Fórmula"}
                        <code className="dre-linha__formula-lista">{linha.formula}</code>
                      </>
                    ) : (
                      definicaoDoModulo(linha.moduloId)?.titulo ?? linha.moduloId
                    )}
                  </td>
                  {/* Icone.jsx é sempre aria-hidden — sem o texto oculto, "sim"
                      e "não" viram a mesma célula vazia pra leitor de tela. */}
                  <td>
                    <span className="sr-only">{linha.mostra ? "Sim" : "Não"}</span>
                    {linha.mostra ? <Icone nome="check" tamanho={15} /> : null}
                  </td>
                  <td>
                    <span className="sr-only">{linha.destaca ? "Sim" : "Não"}</span>
                    {linha.destaca ? <Icone nome="check" tamanho={15} /> : null}
                  </td>
                  <td>
                    <BotoesMover
                      podeSubir={indice > 0}
                      podeDescer={indice < linhas.length - 1}
                      onSubir={() => mover(indice, -1)}
                      onDescer={() => mover(indice, 1)}
                    />
                  </td>
                  <td>
                    <span className="dre-linha__acoes">
                      <button type="button" className="botao-icone" onClick={() => setEditando(linha)} title="Editar">
                        <Icone nome="edit" tamanho={15} />
                      </button>
                      <button
                        type="button"
                        className="botao-icone botao-icone--perigo"
                        onClick={() => setAExcluir(linha)}
                        title="Excluir"
                      >
                        <Icone nome="trash" tamanho={15} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}

              {!linhas.length ? (
                <tr>
                  <td colSpan={6} className="sem-contas">
                    Nenhuma linha ainda. "Nova linha" pra começar a montar o demonstrativo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {editando ? (
        <EditorLinhaDre
          linha={editando.id ? editando : null}
          linhasExistentes={linhas}
          catalogo={catalogo}
          visao={visao}
          onSalvar={(linha) => onDefinirLinha(linha)}
          onFechar={() => setEditando(null)}
        />
      ) : null}

      {aExcluir ? (
        <ModalConfirmacao
          titulo="Excluir linha"
          nome={aExcluir.titulo}
          mensagem={
            <>
              Excluir <strong>{aExcluir.titulo}</strong>? Fórmulas de outras linhas que a
              referenciam (<code>L[{aExcluir.id}]</code>) passam a dar erro até alguém tirar a
              referência.
            </>
          }
          rotuloConfirmar="Excluir"
          onConfirmar={() => {
            onRemoverLinha(aExcluir.id);
            setAExcluir(null);
          }}
          onFechar={() => setAExcluir(null)}
        />
      ) : null}
    </main>
  );
}
