import { useEffect, useMemo, useState } from "react";

import Botao from "../componentes/Botao.jsx";
import Cabecalho from "../componentes/Cabecalho.jsx";
import Icone from "../componentes/Icone.jsx";
import LinhaConta from "../componentes/LinhaConta.jsx";
import Seletor from "../componentes/Seletor.jsx";
import { AvisoErro, Carregando } from "../componentes/Estados.jsx";
import {
  ancestrais,
  desmarcarEmCascata,
  estadoDaSelecao,
  linhasDaArvore,
  marcarEmCascata,
  resumirSelecao,
} from "../dados/contas.js";

// ============================================================================
// EDITAR UM GRUPO
//
// Nome, centros e contas numa tela só, gravados juntos ao confirmar. Diferente
// do resto do portal, que grava a cada clique: aqui um grupo meio montado não
// significa nada, e salvar no fim deixa desistir sem deixar rastro.
// ============================================================================

export default function TelaGrupo({
  grupo,
  centros,
  catalogo,
  carregando,
  erro,
  onRecarregar,
  onSalvar,
  onVoltar,
}) {
  const [nome, setNome] = useState(grupo.nome ?? "");
  const [escolhidos, setEscolhidos] = useState(grupo.centros ?? []);
  const [marcadas, setMarcadas] = useState(() => new Set(grupo.contas ?? []));
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");

  // Trocar de grupo sem sair da tela precisa recarregar os campos — senão o
  // formulário mostra o grupo anterior com o nome do novo no cabeçalho.
  useEffect(() => {
    setNome(grupo.nome ?? "");
    setEscolhidos(grupo.centros ?? []);
    setMarcadas(new Set(grupo.contas ?? []));
  }, [grupo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [expandidos, setExpandidos] = useState(() => new Set(catalogo.raizes));
  useEffect(() => {
    setExpandidos((atuais) => {
      const abertos = new Set([...atuais, ...catalogo.raizes]);
      (grupo.contas ?? []).forEach((codigo) =>
        ancestrais(catalogo, codigo).forEach((pai) => abertos.add(pai))
      );
      return abertos;
    });
  }, [catalogo]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => resumirSelecao(catalogo, marcadas), [catalogo, marcadas]);

  const termo = busca.trim().toLowerCase();
  const linhas = useMemo(() => {
    if (!termo) return linhasDaArvore(catalogo, expandidos);
    return catalogo.lista
      .filter(
        (item) =>
          item.codigo.toLowerCase().includes(termo) ||
          item.descricao.toLowerCase().includes(termo)
      )
      .map((item) => ({ ...item, nivel: 0, temFilhos: false, aberto: true }));
  }, [catalogo, expandidos, termo]);

  const alternar = (codigo, estado) =>
    setMarcadas(
      estado === "total"
        ? desmarcarEmCascata(catalogo, marcadas, codigo)
        : marcarEmCascata(catalogo, marcadas, codigo)
    );

  const alternarNo = (codigo) =>
    setExpandidos((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(codigo)) proximos.delete(codigo);
      else proximos.add(codigo);
      return proximos;
    });

  async function salvar() {
    if (!nome.trim()) return setErroForm("Informe um nome para o grupo.");

    setSalvando(true);
    setErroForm("");
    try {
      await onSalvar({
        id: grupo.id,
        nome: nome.trim(),
        centros: escolhidos,
        contas: [...marcadas],
      });
    } catch (falha) {
      setErroForm(falha?.message ?? "Não foi possível salvar.");
      setSalvando(false);
    }
    return undefined;
  }

  return (
    <main className="conteudo conteudo--orcamento">
      <Cabecalho
        titulo={grupo.nome || "Novo grupo"}
        subtitulo="Escolha os centros e as contas que este recorte usa para ler o DRE."
        onVoltar={onVoltar}
        acao={
          <Botao onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar grupo"}
          </Botao>
        }
      />

      <div className="filtros-orcamento">
        <label>
          <span>Nome do grupo</span>
          <input
            className="campo-fixo campo-fixo--editavel"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Ex.: Fábrica"
            autoFocus
          />
        </label>

        <label>
          <span>Centros de custo</span>
          <Seletor
            multiplo
            rotuloTodos="nenhum centro escolhido"
            valor={escolhidos}
            opcoes={centros.map((centro) => ({
              valor: centro.id,
              rotulo: centro.nome,
              detalhe: centro.id,
            }))}
            aoEscolher={setEscolhidos}
            buscaVazia="Nenhum centro com esse nome."
          />
        </label>
      </div>

      {erroForm ? (
        <p className="modulo-aviso modulo-aviso--atencao">
          <Icone nome="info" tamanho={16} />
          {erroForm}
        </p>
      ) : null}

      {carregando ? <Carregando texto="Carregando plano de contas…" /> : null}
      {erro ? <AvisoErro mensagem={erro} onTentarDeNovo={onRecarregar} /> : null}

      {!carregando && !erro ? (
        <div className="contas-seletor">
          <div className="contas-seletor__topo">
            <label className="campo-busca">
              <input
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Filtrar por código ou descrição…"
              />
            </label>
            <span className="contas-seletor__resumo">
              <small>
                {marcadas.size} {marcadas.size === 1 ? "conta marcada" : "contas marcadas"}
              </small>
              <button
                type="button"
                className="botao-texto"
                onClick={() => setMarcadas(new Set())}
                disabled={!marcadas.size}
              >
                Limpar
              </button>
            </span>
          </div>

          <div className="contas-seletor__lista contas-seletor__lista--alta">
            {linhas.length ? (
              linhas.map((item) => (
                <LinhaConta
                  key={item.codigo}
                  item={item}
                  estado={estadoDaSelecao(resumo, item.codigo)}
                  onAlternar={alternar}
                  onAlternarNo={alternarNo}
                />
              ))
            ) : (
              <p className="sem-contas">Nenhuma conta encontrada.</p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
