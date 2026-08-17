import { Fragment, useMemo, useState } from "react";

import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import Seletor from "../componentes/Seletor.jsx";
import { DicaEdicao } from "../componentes/FiltrosOrcamento.jsx";
import { MESES } from "../dados/seeds.js";
import { chaveFuncionario } from "../dados/plano.js";
import { centrosDaFilial } from "../dados/visao.js";

// ============================================================================
// QUANTIDADE DE FUNCIONÁRIOS
//
// O único módulo que não orça dinheiro. O R$ das contas de pessoal continua em
// Despesas operacionais, onde sempre esteve; aqui se diz quantas pessoas cada
// centro tem em cada mês.
//
// POR QUE A TABELA É TRANSPOSTA
// Nos outros módulos a linha é um mês, porque a dimensão que se percorre é o
// tempo de UMA conta. Aqui a pergunta é outra: quanta gente há em cada centro.
// Com centro na linha e mês na coluna, o quadro do ano inteiro cabe numa tela e
// dá para ver o degrau de contratação de um centro correndo o olho na horizontal.
//
// ZERO NÃO É VAZIO
// Um centro com zero pessoas no mês é uma afirmação — férias coletivas,
// operação parada. Campo em branco é "ninguém informou". São estados
// diferentes: o primeiro grava 0, o segundo apaga a linha.
// ============================================================================

const ABRE_EDICAO = /^[0-9]$/;

// Só dígitos. Quantidade de gente não tem casa decimal nem sinal, e barrar na
// digitação evita explicar depois por que "3,5" virou 3.
const limpar = (texto) => String(texto ?? "").replace(/\D/g, "");

function Celula({
  valor,
  podeEditar,
  editando,
  rascunho,
  onIniciar,
  onMudar,
  onConfirmar,
  onCancelar,
}) {
  if (editando) {
    return (
      <td className="celula-qtde is-editando">
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={rascunho}
          aria-label="Quantidade de funcionários"
          onChange={(evento) => onMudar(limpar(evento.target.value))}
          onBlur={onConfirmar}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") onConfirmar();
            if (evento.key === "Escape") onCancelar();
          }}
        />
      </td>
    );
  }

  return (
    <td
      className={`celula-qtde ${podeEditar ? "is-editavel" : ""} ${valor == null ? "is-vazia" : ""}`}
      tabIndex={podeEditar ? 0 : undefined}
      role={podeEditar ? "button" : undefined}
      onClick={podeEditar ? () => onIniciar(String(valor ?? "")) : undefined}
      onKeyDown={
        podeEditar
          ? (evento) => {
              if (evento.key === "Enter") onIniciar(String(valor ?? ""));
              // Digitar direto começa a edição, como no Excel — sem isto seria
              // preciso clicar antes de cada um dos 384 números.
              else if (ABRE_EDICAO.test(evento.key)) onIniciar(evento.key);
              else if (evento.key === "Delete" || evento.key === "Backspace") onIniciar("");
            }
          : undefined
      }
    >
      {valor == null ? "—" : valor}
    </td>
  );
}

export default function TelaFuncionarios({
  plano,
  visao,
  modulo,
  filiais,
  centros,
  filtros,
  onAlterarFiltro,
  podeLancar,
  onGravar,
  onVoltar,
}) {
  const [editando, setEditando] = useState(null);
  const [rascunho, setRascunho] = useState("");

  const umaFilial = filtros.filial !== "total";
  const filiaisMostradas = umaFilial ? filiais.filter((f) => f.id === filtros.filial) : filiais;

  // Uma linha por (filial, centro) que a visão deu a este módulo. Percorre
  // `centros` — já recortado pela permissão — para herdar nome e ordem do ERP.
  const linhas = useMemo(() => {
    const nomeDoCentro = new Map((centros ?? []).map((centro) => [centro.id, centro.nome]));
    const resultado = [];
    filiaisMostradas.forEach((filial) => {
      centrosDaFilial(visao, modulo.id, filial.id)
        .filter((centroId) => nomeDoCentro.has(centroId))
        .sort()
        .forEach((centroId) => {
          resultado.push({
            filialId: filial.id,
            filialNome: filial.nome,
            centroId,
            centroNome: nomeDoCentro.get(centroId),
          });
        });
    });
    return resultado;
  }, [visao, modulo.id, filiaisMostradas, centros]);

  // Uma "filial" por grupo, na ordem em que já aparecem em `linhas`. Com uma
  // única filial escolhida no filtro, o grupo é só um — o cabeçalho dele fica
  // implícito no filtro acima e não se repete na tabela.
  const grupos = useMemo(() => {
    const porFilial = new Map();
    linhas.forEach((linha) => {
      if (!porFilial.has(linha.filialId)) {
        porFilial.set(linha.filialId, {
          filialId: linha.filialId,
          filialNome: linha.filialNome,
          centros: [],
        });
      }
      porFilial.get(linha.filialId).centros.push(linha);
    });
    return [...porFilial.values()];
  }, [linhas]);

  // Fechadas, não abertas: assim toda filial nasce expandida sem precisar
  // semear o Set com os ids antes de saber quais são.
  const [filiaisFechadas, setFiliaisFechadas] = useState(() => new Set());
  const alternarFilial = (filialId) =>
    setFiliaisFechadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(filialId)) proximo.delete(filialId);
      else proximo.add(filialId);
      return proximo;
    });

  const quantidade = (filialId, centroId, mes) =>
    plano.funcionarios?.[chaveFuncionario(filialId, centroId, mes)] ?? null;

  // Editar exige filial única: com "Total" a mesma célula pertenceria a várias
  // filiais e não haveria onde gravar.
  const podeEditar = podeLancar && umaFilial;

  const totalDoMes = (mes) =>
    linhas.reduce(
      (soma, linha) => soma + (quantidade(linha.filialId, linha.centroId, mes) ?? 0),
      0
    );

  // Média, não soma: somar os doze meses de um centro dá "pessoas-mês", que não
  // é gente nenhuma. A soma só faz sentido na vertical, entre centros.
  const mediaDaLinha = (linha) => {
    const valores = MESES.map((mes) => quantidade(linha.filialId, linha.centroId, mes)).filter(
      (valor) => valor != null
    );
    if (!valores.length) return null;
    return valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
  };

  function confirmar() {
    if (!editando) return;
    const { filialId, centroId, mes } = editando;
    const texto = rascunho.trim();
    const novo = texto === "" ? null : Number(texto);
    const atual = quantidade(filialId, centroId, mes);

    setEditando(null);
    setRascunho("");
    if (novo === atual) return;
    onGravar([{ filial: filialId, centro: centroId, mes, quantidade: novo }]);
  }

  const motivo = !podeLancar
    ? "Você tem acesso de leitura aqui — as quantidades aparecem, mas não podem ser alteradas."
    : !umaFilial
      ? "Para informar a quantidade, escolha uma filial específica."
      : !linhas.length
        ? "Esta filial não tem centro de custo neste módulo. Marque os centros dela em Visões."
        : null;

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
      </div>

      <DicaEdicao>{motivo}</DicaEdicao>

      {/* O valor não se digita aqui, e dizer isso uma vez evita a pergunta de
          onde ele está. */}
      <p className="aviso-modulo">
        <Icone nome="info" tamanho={16} />O valor destas contas é orçado em{" "}
        <strong>Despesas operacionais</strong>. Aqui entra só a quantidade de pessoas.
      </p>

      {linhas.length ? (
        <div className="tabela-wrapper">
          <table className="tabela-qtde">
            <thead>
              <tr>
                <th scope="col" className="col-centro">
                  Centro de custo
                </th>
                {MESES.map((mes) => (
                  <th scope="col" key={mes}>
                    {String(mes).padStart(2, "0")}
                  </th>
                ))}
                <th scope="col" className="col-resumo">
                  Média
                </th>
              </tr>
            </thead>

            <tbody>
              {grupos.map((grupo) => {
                const fechada = !umaFilial && filiaisFechadas.has(grupo.filialId);
                return (
                  <Fragment key={grupo.filialId}>
                    {!umaFilial ? (
                      <tr className="linha-grupo-filial">
                        <th scope="rowgroup" colSpan={2 + MESES.length}>
                          <button
                            type="button"
                            className="grupo-filial-toggle"
                            onClick={() => alternarFilial(grupo.filialId)}
                            aria-expanded={!fechada}
                          >
                            <span className={`arvore-chevron ${!fechada ? "is-aberto" : ""}`}>
                              <Icone nome="chevron" tamanho={13} />
                            </span>
                            <span>{grupo.filialNome}</span>
                            <span className="arvore-contagem">
                              {grupo.centros.length}{" "}
                              {grupo.centros.length === 1 ? "centro" : "centros"}
                            </span>
                          </button>
                        </th>
                      </tr>
                    ) : null}

                    {fechada
                      ? null
                      : grupo.centros.map((linha) => {
                          const media = mediaDaLinha(linha);
                          return (
                            <tr key={`${linha.filialId}|${linha.centroId}`}>
                              <th scope="row" className="col-centro">
                                <span>{linha.centroNome}</span>
                                <small>{linha.centroId}</small>
                              </th>

                              {MESES.map((mes) => {
                                const ehEsta =
                                  editando?.filialId === linha.filialId &&
                                  editando?.centroId === linha.centroId &&
                                  editando?.mes === mes;
                                return (
                                  <Celula
                                    key={mes}
                                    valor={quantidade(linha.filialId, linha.centroId, mes)}
                                    podeEditar={podeEditar}
                                    editando={ehEsta}
                                    rascunho={rascunho}
                                    onIniciar={(inicial) => {
                                      setEditando({
                                        filialId: linha.filialId,
                                        centroId: linha.centroId,
                                        mes,
                                      });
                                      setRascunho(limpar(inicial));
                                    }}
                                    onMudar={setRascunho}
                                    onConfirmar={confirmar}
                                    onCancelar={() => {
                                      setEditando(null);
                                      setRascunho("");
                                    }}
                                  />
                                );
                              })}

                              <td className="col-resumo">
                                {media == null ? "—" : media.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                  </Fragment>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <th scope="row" className="col-centro">
                  Total de pessoas
                </th>
                {MESES.map((mes) => (
                  <td key={mes}>{totalDoMes(mes)}</td>
                ))}
                <td className="col-resumo">
                  {(MESES.reduce((soma, mes) => soma + totalDoMes(mes), 0) / MESES.length).toFixed(
                    1
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </main>
  );
}
