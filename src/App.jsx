import React, { useMemo, useState } from "react";

// ============================================================================
// CAMADA DE DADOS
// No sistema real, estas constantes e os geradores mockados abaixo serão
// substituídos por chamadas à API/banco de dados.
// ============================================================================

const EMPRESA = "KING & JOE CONFECCOES LTDA";

const CONTAS_RECEITA = [
  { id: "3.1.1.01.001", codigo: "3.1.1.01.001", descricao: "VENDAS DE PRODUTOS - COLEÇÃO" },
  { id: "3.1.1.01.002", codigo: "3.1.1.01.002", descricao: "VENDAS DE PRODUTOS - SALDO" },
  { id: "3.1.1.01.003", codigo: "3.1.1.01.003", descricao: "VENDAS DE PRODUTOS - BAZAR" },
  { id: "3.1.1.01.004", codigo: "3.1.1.01.004", descricao: "VENDAS DE PRODUTOS - E-COMMERCE" },
  { id: "3.1.1.01.005", codigo: "3.1.1.01.005", descricao: "VENDAS DE PRODUTOS - MOSTRUÁRIO" },
  { id: "3.1.1.01.006", codigo: "3.1.1.01.006", descricao: "VENDAS DE RESÍDUOS TÊXTEIS" },
  { id: "3.1.1.01.007", codigo: "3.1.1.01.007", descricao: "VENDAS DE MERCADORIAS - COLEÇÃO" },
  { id: "3.1.1.01.050", codigo: "3.1.1.01.050", descricao: "VENDAS DE PRODUTOS NO MERCADO EXTERNO" },
  { id: "3.1.1.01.051", codigo: "3.1.1.01.051", descricao: "VENDAS DE MERCADORIAS NO MERCADO EXTERNO" },
  { id: "3.1.1.01.052", codigo: "3.1.1.01.052", descricao: "VENDAS DE MERCADORIAS E PRODUTOS" },
  { id: "3.1.1.01.060", codigo: "3.1.1.01.060", descricao: "FABRICAÇÃO POR ENCOMENDA" },
  { id: "3.1.1.02.001", codigo: "3.1.1.02.001", descricao: "SERVIÇOS PRESTADOS MERCADO INTERNO" },
  { id: "3.1.1.02.002", codigo: "3.1.1.02.002", descricao: "SERVIÇOS PRESTADOS MERCADO EXTERNO" },
  { id: "3.1.1.05.001", codigo: "3.1.1.05.001", descricao: "VENDAS DE MERCADORIA - LOJAS" },
];

const CONTAS_DEDUCAO = [
  { id: "3.1.9.01.001", codigo: "3.1.9.01.001", descricao: "DEVOLUÇÕES DE VENDAS" },
  { id: "3.1.9.01.002", codigo: "3.1.9.01.002", descricao: "ABATIMENTOS E DESCONTOS" },
  { id: "3.1.9.02.001", codigo: "3.1.9.02.001", descricao: "ICMS SOBRE VENDAS" },
  { id: "3.1.9.02.002", codigo: "3.1.9.02.002", descricao: "PIS SOBRE VENDAS" },
  { id: "3.1.9.02.003", codigo: "3.1.9.02.003", descricao: "COFINS SOBRE VENDAS" },
  { id: "3.1.9.02.004", codigo: "3.1.9.02.004", descricao: "IPI SOBRE VENDAS" },
  { id: "3.1.9.02.005", codigo: "3.1.9.02.005", descricao: "SIMPLES NACIONAL" },
];

const FILIAIS_SEED = [
  { id: "akr", nome: "AKR Brands" },
  { id: "menhub", nome: "MenHUB" },
  { id: "loja", nome: "Loja" },
];

const CENTROS_SEED = [
  { id: "administrativo", nome: "ADMINISTRATIVO" },
  { id: "comercial", nome: "COMERCIAL" },
  { id: "financeiro", nome: "FINANCEIRO" },
  { id: "controladoria", nome: "CONTROLADORIA" },
];

const CANAIS_SEED = [
  {
    id: "atacado",
    nome: "ATACADO",
    contas: ["3.1.1.01.001", "3.1.1.01.002", "3.1.1.01.003"],
  },
  {
    id: "varejo",
    nome: "VAREJO / LOJAS",
    contas: ["3.1.1.05.001", "3.1.1.01.052"],
  },
  { id: "ecommerce", nome: "E-COMMERCE", contas: ["3.1.1.01.004"] },
  {
    id: "mercado-externo",
    nome: "MERCADO EXTERNO",
    contas: ["3.1.1.01.050", "3.1.1.01.051", "3.1.1.02.002"],
  },
];

const DEDUCOES_SEED = [
  {
    id: "devolucoes",
    nome: "DEVOLUÇÕES",
    contas: ["3.1.9.01.001", "3.1.9.01.002"],
  },
  {
    id: "impostos",
    nome: "IMPOSTOS SOBRE VENDAS",
    contas: ["3.1.9.02.001", "3.1.9.02.002", "3.1.9.02.003"],
  },
];

const MODULOS = {
  filiais: { titulo: "Filiais", tipo: "config", icone: "building" },
  centros: { titulo: "Centro de Custos", tipo: "config", icone: "layers" },
  canais: { titulo: "Canais", tipo: "config", icone: "route" },
  deducao: { titulo: "Dedução", tipo: "config", icone: "percent" },
  vendas: { titulo: "Receita de Vendas", tipo: "receita", icone: "chart" },
  operacionais: { titulo: "Receitas Operacionais", tipo: "receita", icone: "coins" },
  deducaoVendas: { titulo: "Dedução de Vendas", tipo: "despesa", icone: "trendingDown" },
};

const MESES = Array.from({ length: 12 }, (_, index) => index + 1);

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentual = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatarMoeda(valor) {
  return moeda.format(Number.isFinite(valor) ? valor : 0);
}

function formatarPercentual(valor) {
  return `${percentual.format(Number.isFinite(valor) ? valor : 0)}%`;
}

function parseNumeroPtBr(texto) {
  const limpo = String(texto ?? "").replace(/\s/g, "");
  if (!limpo) return 0;
  if (limpo.includes(",")) {
    return Number(limpo.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(limpo) || 0;
}

function hashDeterministico(texto) {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function ruido(chave, amplitude = 0.08) {
  return 1 + (((hashDeterministico(chave) % 2001) / 1000) - 1) * amplitude;
}

function chavePlanejado(modulo, filialId, canalId, ano, mes) {
  return `${modulo}|${filialId}|${canalId}|${ano}|${mes}`;
}

function chavePercentual(filialId, canalId, deducaoId, ano, mes) {
  return `${filialId}|${canalId}|${deducaoId}|${ano}|${mes}`;
}

function baseCanal(canalId, modulo) {
  const vendas = {
    atacado: 1850000,
    varejo: 1040000,
    ecommerce: 670000,
    "mercado-externo": 0,
  };
  const operacionais = {
    atacado: 172000,
    varejo: 108000,
    ecommerce: 76000,
    "mercado-externo": 0,
  };
  return (modulo === "operacionais" ? operacionais : vendas)[canalId] ?? 0;
}

function fatorFilial(filialId) {
  return { akr: 1.08, menhub: 0.82, loja: 0.64 }[filialId] ?? 0.58;
}

function fatorSazonal(mes) {
  return [0.82, 0.88, 0.97, 0.94, 1.01, 1.04, 1.08, 1.02, 1.06, 1.13, 1.28, 1.42][mes - 1];
}

function gerarPlanejado(modulo, filialId, canalId, ano, mes) {
  const base = baseCanal(canalId, modulo);
  if (!base) return 0;
  const crescimento = Math.pow(1.075, ano - 2024);
  const valor =
    base *
    fatorFilial(filialId) *
    fatorSazonal(mes) *
    crescimento *
    ruido(`plan|${modulo}|${filialId}|${canalId}|${ano}|${mes}`, 0.055);
  return Math.round(valor / 100) * 100;
}

// Mock determinístico de realizado/ano anterior. Substituir pela consulta ao banco.
function gerarRealizado(modulo, filialId, canalId, ano, mes, ehAnoAnterior = false) {
  const anoReferencia = ehAnoAnterior ? ano - 1 : ano;
  if (!ehAnoAnterior && (ano > 2026 || (ano === 2026 && mes > 7))) return 0;
  const planejadoBase = gerarPlanejado(modulo, filialId, canalId, anoReferencia, mes);
  if (!planejadoBase) return 0;
  return (
    Math.round(
      (planejadoBase *
        ruido(`real|${modulo}|${filialId}|${canalId}|${anoReferencia}|${mes}`, 0.115)) /
        100
    ) * 100
  );
}

function percentualBaseDeducao(deducaoId) {
  return { devolucoes: 2.35, impostos: 10.82 }[deducaoId] ?? 0;
}

function gerarPercentualPlanejado(filialId, canalId, deducaoId, ano, mes) {
  if (canalId === "mercado-externo") return 0;
  const base = percentualBaseDeducao(deducaoId);
  if (!base) return 0;
  return Number(
    (
      base *
      ruido(`pct-plan|${filialId}|${canalId}|${deducaoId}|${ano}|${mes}`, 0.09)
    ).toFixed(3)
  );
}

// Mock determinístico de percentuais realizados. Substituir pela consulta ao banco.
function gerarPercentualRealizado(filialId, canalId, deducaoId, ano, mes, ehAnoAnterior = false) {
  if (canalId === "mercado-externo") return 0;
  const anoReferencia = ehAnoAnterior ? ano - 1 : ano;
  return Number(
    (
      percentualBaseDeducao(deducaoId) *
      ruido(`pct-real|${filialId}|${canalId}|${deducaoId}|${anoReferencia}|${mes}`, 0.14)
    ).toFixed(3)
  );
}

function criarPlano(id, nome, inicio, fim) {
  const planejado = {};
  const pctPlanejado = {};

  for (let ano = inicio; ano <= fim; ano += 1) {
    FILIAIS_SEED.forEach((filial) => {
      CANAIS_SEED.forEach((canal) => {
        MESES.forEach((mes) => {
          planejado[chavePlanejado("vendas", filial.id, canal.id, ano, mes)] =
            gerarPlanejado("vendas", filial.id, canal.id, ano, mes);
          planejado[chavePlanejado("operacionais", filial.id, canal.id, ano, mes)] =
            gerarPlanejado("operacionais", filial.id, canal.id, ano, mes);
          DEDUCOES_SEED.forEach((deducao) => {
            pctPlanejado[chavePercentual(filial.id, canal.id, deducao.id, ano, mes)] =
              gerarPercentualPlanejado(filial.id, canal.id, deducao.id, ano, mes);
          });
        });
      });
    });
  }

  return {
    id,
    nome,
    inicio,
    fim,
    filiais: FILIAIS_SEED.map((item) => ({ ...item })),
    centros: CENTROS_SEED.map((item) => ({ ...item })),
    canais: CANAIS_SEED.map((item) => ({ ...item, contas: [...item.contas] })),
    deducoes: DEDUCOES_SEED.map((item) => ({ ...item, contas: [...item.contas] })),
    planejado,
    pctPlanejado,
  };
}

function criarPlanosIniciais() {
  return [
    criarPlano("orcamento-reajustado", "Orçamento 2024-2026 - Reajustado", 2024, 2026),
    criarPlano("oficial", "Oficial", 2024, 2026),
  ];
}

function idsSelecionados(lista, idSelecionado) {
  return idSelecionado === "total" ? lista.map((item) => item.id) : [idSelecionado];
}

function obterPlanejado(plan, modulo, filialIds, canalIds, ano, mes) {
  let total = 0;
  filialIds.forEach((filialId) => {
    canalIds.forEach((canalId) => {
      total += plan.planejado[chavePlanejado(modulo, filialId, canalId, ano, mes)] ?? 0;
    });
  });
  return total;
}

function obterRealizado(modulo, filialIds, canalIds, ano, mes, ehAnoAnterior = false) {
  let total = 0;
  filialIds.forEach((filialId) => {
    canalIds.forEach((canalId) => {
      total += gerarRealizado(modulo, filialId, canalId, ano, mes, ehAnoAnterior);
    });
  });
  return total;
}

function obterDeducaoMes(plan, filialIds, canalIds, deducaoIds, ano, mes) {
  let receitaPlan = 0;
  let receitaReal = 0;
  let receitaAnterior = 0;
  let valorPlan = 0;
  let valorReal = 0;
  let valorAnterior = 0;

  filialIds.forEach((filialId) => {
    canalIds.forEach((canalId) => {
      const planReceita =
        plan.planejado[chavePlanejado("vendas", filialId, canalId, ano, mes)] ?? 0;
      const realReceita = gerarRealizado("vendas", filialId, canalId, ano, mes, false);
      const anteriorReceita = gerarRealizado("vendas", filialId, canalId, ano, mes, true);
      let pctPlanCombinacao = 0;
      let pctRealCombinacao = 0;
      let pctAnteriorCombinacao = 0;

      deducaoIds.forEach((deducaoId) => {
        pctPlanCombinacao +=
          plan.pctPlanejado[
            chavePercentual(filialId, canalId, deducaoId, ano, mes)
          ] ?? 0;
        pctRealCombinacao += gerarPercentualRealizado(
          filialId,
          canalId,
          deducaoId,
          ano,
          mes,
          false
        );
        pctAnteriorCombinacao += gerarPercentualRealizado(
          filialId,
          canalId,
          deducaoId,
          ano,
          mes,
          true
        );
      });

      receitaPlan += planReceita;
      receitaReal += realReceita;
      receitaAnterior += anteriorReceita;
      valorPlan += planReceita * (pctPlanCombinacao / 100);
      valorReal += realReceita * (pctRealCombinacao / 100);
      valorAnterior += anteriorReceita * (pctAnteriorCombinacao / 100);
    });
  });

  return {
    receitaPlan,
    receitaReal,
    receitaAnterior,
    valorPlan,
    valorReal,
    valorAnterior,
    pctPlan: receitaPlan ? (valorPlan / receitaPlan) * 100 : 0,
    pctReal: receitaReal ? (valorReal / receitaReal) * 100 : 0,
    pctAnterior: receitaAnterior ? (valorAnterior / receitaAnterior) * 100 : 0,
  };
}

function calcularVariacao(realizado, anterior) {
  const variacao = realizado - anterior;
  const variacaoPercentual = anterior ? (variacao / Math.abs(anterior)) * 100 : 0;
  return { variacao, variacaoPercentual };
}

function criarLinhasOrcamento(plan, modulo, filialId, canalId, ano) {
  const filialIds = idsSelecionados(plan.filiais, filialId);
  const canalIds = idsSelecionados(plan.canais, canalId);
  const meses = MESES.map((mes) => {
    const planejado = obterPlanejado(plan, modulo, filialIds, canalIds, ano, mes);
    const realizado = obterRealizado(modulo, filialIds, canalIds, ano, mes, false);
    const anterior = obterRealizado(modulo, filialIds, canalIds, ano, mes, true);
    return {
      id: mes,
      label: `${String(mes).padStart(2, "0")}/${ano}`,
      planejado,
      realizado,
      anterior,
      ...calcularVariacao(realizado, anterior),
    };
  });

  const somar = (campo) => meses.reduce((soma, linha) => soma + linha[campo], 0);
  const total = {
    id: "total",
    label: "Total",
    planejado: somar("planejado"),
    realizado: somar("realizado"),
    anterior: somar("anterior"),
  };
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  const media = {
    id: "media",
    label: "Média",
    planejado: total.planejado / 12,
    realizado: total.realizado / 12,
    anterior: total.anterior / 12,
  };
  Object.assign(media, calcularVariacao(media.realizado, media.anterior));
  return [...meses, total, media];
}

function criarLinhasDeducao(plan, filialId, canalId, deducaoId, ano, aba) {
  const filialIds = idsSelecionados(plan.filiais, filialId);
  const canalIds = idsSelecionados(plan.canais, canalId);
  const deducaoIds = idsSelecionados(plan.deducoes, deducaoId);
  const dadosMensais = MESES.map((mes) =>
    obterDeducaoMes(plan, filialIds, canalIds, deducaoIds, ano, mes)
  );

  const meses = dadosMensais.map((dados, index) => {
    const planejado = aba === "percentual" ? dados.pctPlan : dados.valorPlan;
    const realizado = aba === "percentual" ? dados.pctReal : dados.valorReal;
    const anterior = aba === "percentual" ? dados.pctAnterior : dados.valorAnterior;
    return {
      id: index + 1,
      label: `${String(index + 1).padStart(2, "0")}/${ano}`,
      planejado,
      realizado,
      anterior,
      ...calcularVariacao(realizado, anterior),
    };
  });

  let total;
  if (aba === "percentual") {
    const soma = (campo) => dadosMensais.reduce((valor, item) => valor + item[campo], 0);
    const receitaPlan = soma("receitaPlan");
    const receitaReal = soma("receitaReal");
    const receitaAnterior = soma("receitaAnterior");
    total = {
      id: "total",
      label: "Total ponderado",
      planejado: receitaPlan ? (soma("valorPlan") / receitaPlan) * 100 : 0,
      realizado: receitaReal ? (soma("valorReal") / receitaReal) * 100 : 0,
      anterior: receitaAnterior ? (soma("valorAnterior") / receitaAnterior) * 100 : 0,
    };
  } else {
    const somarLinha = (campo) => meses.reduce((valor, item) => valor + item[campo], 0);
    total = {
      id: "total",
      label: "Total",
      planejado: somarLinha("planejado"),
      realizado: somarLinha("realizado"),
      anterior: somarLinha("anterior"),
    };
  }
  Object.assign(total, calcularVariacao(total.realizado, total.anterior));

  const media = {
    id: "media",
    label: "Média",
    planejado: meses.reduce((s, item) => s + item.planejado, 0) / 12,
    realizado: meses.reduce((s, item) => s + item.realizado, 0) / 12,
    anterior: meses.reduce((s, item) => s + item.anterior, 0) / 12,
  };
  Object.assign(media, calcularVariacao(media.realizado, media.anterior));
  return [...meses, total, media];
}

function totalCanalNoAno(plan, modulo, filialId, canalId, ano) {
  const filialIds = idsSelecionados(plan.filiais, filialId);
  return MESES.reduce(
    (total, mes) => total + obterPlanejado(plan, modulo, filialIds, [canalId], ano, mes),
    0
  );
}

function gerarId(prefixo) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================================
// COMPONENTES DE APRESENTAÇÃO
// ============================================================================

function Icone({ nome, tamanho = 20 }) {
  const props = {
    width: tamanho,
    height: tamanho,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  const desenhos = {
    arrowLeft: (
      <>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="m7 7 1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V5l8-3v19" />
        <path d="M12 8h8v13M2 21h20" />
        <path d="M7 7h1M7 11h1M7 15h1M16 12h1M16 16h1" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3" />
      </>
    ),
    percent: (
      <>
        <path d="m19 5-14 14" />
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    coins: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 10v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
        <path d="M4 15v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" />
      </>
    ),
    trendingDown: (
      <>
        <path d="m3 5 7 7 4-4 7 7" />
        <path d="M21 10v5h-5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    wallet: (
      <>
        <path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12" />
        <path d="M16 12h6v4h-6a2 2 0 0 1 0-4Z" />
      </>
    ),
  };
  return <svg {...props}>{desenhos[nome] ?? desenhos.wallet}</svg>;
}

function Botao({ children, variante = "primario", className = "", ...props }) {
  return (
    <button type="button" className={`botao botao--${variante} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Cabecalho({ titulo, subtitulo, onVoltar, acao }) {
  return (
    <div className="cabecalho-pagina">
      <div className="cabecalho-pagina__texto">
        {onVoltar ? (
          <button type="button" className="botao-voltar" onClick={onVoltar} aria-label="Voltar">
            <Icone nome="arrowLeft" tamanho={19} />
          </button>
        ) : null}
        <div>
          <h1>{titulo}</h1>
          {subtitulo ? <p>{subtitulo}</p> : null}
        </div>
      </div>
      {acao ?? null}
    </div>
  );
}

function EstadoVazio({ texto }) {
  return (
    <div className="estado-vazio">
      <span className="estado-vazio__icone">
        <Icone nome="wallet" tamanho={24} />
      </span>
      <strong>Nenhum item por aqui</strong>
      <p>{texto}</p>
    </div>
  );
}

function Modal({ titulo, children, onFechar, largura = "620px" }) {
  return (
    <div className="overlay" role="presentation" onMouseDown={onFechar}>
      <div
        className="modal"
        style={{ maxWidth: largura }}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__topo">
          <h2>{titulo}</h2>
          <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar">
            <Icone nome="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ListaSelecao({
  titulo,
  itens,
  selecionado,
  onSelecionar,
  totalLabel = "Total",
  mostrarValores = false,
  obterValor,
}) {
  return (
    <section className="painel-selecao">
      <h3>{titulo}</h3>
      <button
        type="button"
        className={`selecao-item ${selecionado === "total" ? "is-active" : ""}`}
        onClick={() => onSelecionar("total")}
      >
        <span>{totalLabel}</span>
        {mostrarValores ? <b>{formatarMoeda(obterValor("total"))}</b> : null}
      </button>
      {itens.map((item) => (
        <button
          type="button"
          className={`selecao-item ${selecionado === item.id ? "is-active" : ""}`}
          onClick={() => onSelecionar(item.id)}
          key={item.id}
        >
          <span>{item.nome}</span>
          {mostrarValores ? <b>{formatarMoeda(obterValor(item.id))}</b> : null}
        </button>
      ))}
    </section>
  );
}

function TabelaOrcamento({
  linhas,
  formato = "moeda",
  podeEditar,
  editingCell,
  onIniciarEdicao,
  onAlterarEdicao,
  onConfirmarEdicao,
  onCancelarEdicao,
  prefixoCelula,
}) {
  const formatar = formato === "percentual" ? formatarPercentual : formatarMoeda;
  return (
    <div className="tabela-wrap">
      <table className="tabela-orcamento">
        <thead>
          <tr>
            <th>Mês</th>
            <th>Planejado</th>
            <th>Realizado</th>
            <th>Ano anterior</th>
            <th>Variação {formato === "percentual" ? "p.p." : "$"}</th>
            <th>Variação %</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const ehResumo = linha.id === "total" || linha.id === "media";
            const celulaId = `${prefixoCelula}|${linha.id}`;
            const emEdicao = editingCell?.id === celulaId;
            const editavel = podeEditar && !ehResumo;
            return (
              <tr
                key={linha.id}
                className={linha.id === "total" ? "linha-total" : linha.id === "media" ? "linha-media" : ""}
              >
                <th>{linha.label}</th>
                <td
                  className={editavel ? "celula-editavel" : ""}
                  onClick={() =>
                    editavel && !emEdicao
                      ? onIniciarEdicao(celulaId, linha.planejado, linha.id)
                      : undefined
                  }
                  title={editavel ? "Clique para editar" : undefined}
                >
                  {emEdicao ? (
                    <input
                      className="input-inline"
                      value={editingCell.valor}
                      onChange={(event) => onAlterarEdicao(event.target.value)}
                      onBlur={onConfirmarEdicao}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") onCancelarEdicao();
                      }}
                      autoFocus
                      inputMode="decimal"
                      aria-label={`Editar planejado de ${linha.label}`}
                    />
                  ) : (
                    formatar(linha.planejado)
                  )}
                </td>
                <td>{formatar(linha.realizado)}</td>
                <td>{formatar(linha.anterior)}</td>
                <td className={linha.variacao > 0 ? "positivo" : linha.variacao < 0 ? "negativo" : ""}>
                  {formato === "percentual"
                    ? `${linha.variacao > 0 ? "+" : ""}${formatarPercentual(linha.variacao)}`
                    : `${linha.variacao > 0 ? "+" : ""}${formatarMoeda(linha.variacao)}`}
                </td>
                <td
                  className={
                    linha.variacaoPercentual > 0
                      ? "positivo"
                      : linha.variacaoPercentual < 0
                        ? "negativo"
                        : ""
                  }
                >
                  {linha.variacaoPercentual > 0 ? "+" : ""}
                  {formatarPercentual(linha.variacaoPercentual)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// APLICAÇÃO
// ============================================================================

export default function PlanejamentoOrcamentario() {
  const [planos, setPlanos] = useState(criarPlanosIniciais);
  const [tela, setTela] = useState("planos");
  const [planoAtivoId, setPlanoAtivoId] = useState(null);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [novoPlano, setNovoPlano] = useState({ nome: "", inicio: "2024", fim: "2026" });
  const [erroPlano, setErroPlano] = useState("");
  const [modal, setModal] = useState(null);
  const [modalNome, setModalNome] = useState("");
  const [modalContas, setModalContas] = useState([]);
  const [filialSelecionada, setFilialSelecionada] = useState("total");
  const [anoSelecionado, setAnoSelecionado] = useState(2026);
  const [canalSelecionado, setCanalSelecionado] = useState("total");
  const [deducaoSelecionada, setDeducaoSelecionada] = useState("total");
  const [ocultarSemValores, setOcultarSemValores] = useState(true);
  const [abaDeducao, setAbaDeducao] = useState("percentual");
  const [editingCell, setEditingCell] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);

  const planoAtivo = useMemo(
    () => planos.find((plano) => plano.id === planoAtivoId) ?? null,
    [planos, planoAtivoId]
  );

  const linhasOrcamento = useMemo(() => {
    if (!planoAtivo || (tela !== "vendas" && tela !== "operacionais")) return [];
    return criarLinhasOrcamento(
      planoAtivo,
      tela,
      filialSelecionada,
      canalSelecionado,
      anoSelecionado
    );
  }, [planoAtivo, tela, filialSelecionada, canalSelecionado, anoSelecionado]);

  const linhasDeducao = useMemo(() => {
    if (!planoAtivo || tela !== "deducaoVendas") return [];
    return criarLinhasDeducao(
      planoAtivo,
      filialSelecionada,
      canalSelecionado,
      deducaoSelecionada,
      anoSelecionado,
      abaDeducao
    );
  }, [
    planoAtivo,
    tela,
    filialSelecionada,
    canalSelecionado,
    deducaoSelecionada,
    anoSelecionado,
    abaDeducao,
  ]);

  const canaisVisiveis = useMemo(() => {
    if (!planoAtivo) return [];
    const modulo = tela === "operacionais" ? "operacionais" : "vendas";
    if (!ocultarSemValores) return planoAtivo.canais;
    return planoAtivo.canais.filter(
      (canal) =>
        totalCanalNoAno(
          planoAtivo,
          modulo,
          filialSelecionada,
          canal.id,
          anoSelecionado
        ) !== 0
    );
  }, [planoAtivo, tela, ocultarSemValores, filialSelecionada, anoSelecionado]);

  function atualizarPlanoAtivo(transformar) {
    setPlanos((atuais) =>
      atuais.map((plano) => (plano.id === planoAtivoId ? transformar(plano) : plano))
    );
  }

  function irParaTopo() {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function abrirPlano(id) {
    const plano = planos.find((item) => item.id === id);
    setPlanoAtivoId(id);
    setTela("home");
    setAnoSelecionado(plano?.fim ?? 2026);
    setFilialSelecionada("total");
    setCanalSelecionado("total");
    setDeducaoSelecionada("total");
    setEditingCell(null);
    irParaTopo();
  }

  function abrirModulo(modulo) {
    setTela(modulo);
    setFilialSelecionada("total");
    setCanalSelecionado("total");
    setDeducaoSelecionada("total");
    setOcultarSemValores(true);
    setAbaDeducao("percentual");
    setEditingCell(null);
    irParaTopo();
  }

  function voltar() {
    setEditingCell(null);
    if (tela === "home") {
      setTela("planos");
      setPlanoAtivoId(null);
    } else {
      setTela("home");
    }
    irParaTopo();
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
    const id = gerarId("plano");
    setPlanos((atuais) => [...atuais, criarPlano(id, novoPlano.nome.trim(), inicio, fim)]);
    setNovoPlano({ nome: "", inicio: "2024", fim: "2026" });
    setErroPlano("");
    setDrawerAberto(false);
  }

  function excluirPlano(id) {
    setPlanos((atuais) => atuais.filter((plano) => plano.id !== id));
    setConfirmacao(null);
  }

  function abrirModalSimples(tipo, item = null) {
    setModal({ tipo, id: item?.id ?? null });
    setModalNome(item?.nome ?? "");
    setModalContas(item?.contas ? [...item.contas] : []);
  }

  function salvarModal() {
    const nome = modalNome.trim();
    if (!nome || !planoAtivo || !modal) return;
    const configuracao = {
      filiais: { campo: "filiais", prefixo: "filial" },
      centros: { campo: "centros", prefixo: "centro" },
      canais: { campo: "canais", prefixo: "canal" },
      deducao: { campo: "deducoes", prefixo: "deducao" },
    }[modal.tipo];
    if (!configuracao) return;

    atualizarPlanoAtivo((plano) => {
      const lista = plano[configuracao.campo];
      const proximaLista = modal.id
        ? lista.map((item) =>
            item.id === modal.id
              ? {
                  ...item,
                  nome,
                  ...(modal.tipo === "canais" || modal.tipo === "deducao"
                    ? { contas: [...modalContas] }
                    : {}),
                }
              : item
          )
        : [
            ...lista,
            {
              id: gerarId(configuracao.prefixo),
              nome,
              ...(modal.tipo === "canais" || modal.tipo === "deducao"
                ? { contas: [...modalContas] }
                : {}),
            },
          ];
      return { ...plano, [configuracao.campo]: proximaLista };
    });
    setModal(null);
  }

  function confirmarExclusaoConfiguracao() {
    if (!confirmacao || !planoAtivo) return;
    const campo = {
      filiais: "filiais",
      centros: "centros",
      canais: "canais",
      deducao: "deducoes",
    }[confirmacao.tipo];
    atualizarPlanoAtivo((plano) => ({
      ...plano,
      [campo]: plano[campo].filter((item) => item.id !== confirmacao.id),
    }));
    setConfirmacao(null);
  }

  function iniciarEdicao(id, valor, mes) {
    setEditingCell({
      id,
      mes,
      valor: formatoEdicao(valor),
    });
  }

  function formatoEdicao(valor) {
    return String(Number(valor.toFixed(3))).replace(".", ",");
  }

  function confirmarEdicao() {
    if (!editingCell || !planoAtivo) return;
    const valorDigitado = parseNumeroPtBr(editingCell.valor);
    if (tela === "deducaoVendas") {
      const valor = Math.max(0, Math.min(100, valorDigitado));
      const key = chavePercentual(
        filialSelecionada,
        canalSelecionado,
        deducaoSelecionada,
        anoSelecionado,
        editingCell.mes
      );
      atualizarPlanoAtivo((plano) => ({
        ...plano,
        pctPlanejado: { ...plano.pctPlanejado, [key]: valor },
      }));
    } else {
      const valor = Math.max(0, valorDigitado);
      const key = chavePlanejado(
        tela,
        filialSelecionada,
        canalSelecionado,
        anoSelecionado,
        editingCell.mes
      );
      atualizarPlanoAtivo((plano) => ({
        ...plano,
        planejado: { ...plano.planejado, [key]: valor },
      }));
    }
    setEditingCell(null);
  }

  const renderizarPlanos = () => (
    <main className="conteudo conteudo--planos">
      <Cabecalho
        titulo="Planos Orçamentários"
        subtitulo="Crie versões independentes e acompanhe diferentes cenários do orçamento."
        acao={
          <Botao onClick={() => setDrawerAberto(true)}>
            <Icone nome="plus" tamanho={18} />
            Novo plano
          </Botao>
        }
      />
      <div className="planos-meta">
        <span>{planos.length} {planos.length === 1 ? "plano" : "planos"}</span>
        <span>Selecione um plano para acessar seus módulos</span>
      </div>
      {planos.length ? (
        <div className="grid-planos">
          {planos.map((plano) => (
            <article className="card-plano" key={plano.id}>
              <button
                type="button"
                className="card-plano__abrir"
                onClick={() => abrirPlano(plano.id)}
                aria-label={`Abrir ${plano.nome}`}
              >
                <span className="card-plano__icone">
                  <Icone nome="calendar" />
                </span>
                <span className="card-plano__texto">
                  <strong>{plano.nome}</strong>
                  <small>
                    01/01/{plano.inicio} até 31/12/{plano.fim}
                  </small>
                </span>
                <span className="card-plano__seta">
                  <Icone nome="chevron" tamanho={18} />
                </span>
              </button>
              <button
                type="button"
                className="card-plano__excluir"
                onClick={() =>
                  setConfirmacao({
                    tipo: "plano",
                    id: plano.id,
                    nome: plano.nome,
                  })
                }
                aria-label={`Excluir ${plano.nome}`}
              >
                <Icone nome="trash" tamanho={18} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EstadoVazio texto="Adicione um plano para começar seu planejamento." />
      )}
    </main>
  );

  const renderizarHome = () => (
    <main className="conteudo">
      <Cabecalho
        titulo={planoAtivo?.nome ?? "Plano"}
        subtitulo={`Período de ${planoAtivo?.inicio} a ${planoAtivo?.fim}`}
        onVoltar={voltar}
      />
      <section className="secao-modulos">
        <div className="secao-modulos__cabecalho">
          <div>
            <span className="numero-secao">01</span>
            <h2>Configuração</h2>
          </div>
          <p>Estruture as dimensões que formam este plano.</p>
        </div>
        <div className="grid-modulos grid-modulos--config">
          {["filiais", "centros", "canais", "deducao"].map((id) => (
            <button type="button" className="card-modulo card-modulo--config" key={id} onClick={() => abrirModulo(id)}>
              <span className="card-modulo__icone">
                <Icone nome={MODULOS[id].icone} tamanho={23} />
              </span>
              <span>
                <strong>{MODULOS[id].titulo}</strong>
                <small>
                  {id === "filiais"
                    ? `${planoAtivo?.filiais.length} cadastradas`
                    : id === "centros"
                      ? `${planoAtivo?.centros.length} cadastrados`
                      : id === "canais"
                        ? `${planoAtivo?.canais.length} configurados`
                        : `${planoAtivo?.deducoes.length} configuradas`}
                </small>
              </span>
              <Icone nome="chevron" tamanho={17} />
            </button>
          ))}
        </div>
      </section>
      <section className="secao-modulos">
        <div className="secao-modulos__cabecalho">
          <div>
            <span className="numero-secao">02</span>
            <h2>Orçamentos</h2>
          </div>
          <p>Planeje, compare e revise os resultados mensais.</p>
        </div>
        <div className="grid-modulos grid-modulos--orcamento">
          {["vendas", "operacionais", "deducaoVendas"].map((id) => (
            <button
              type="button"
              className={`card-modulo card-modulo--${MODULOS[id].tipo}`}
              key={id}
              onClick={() => abrirModulo(id)}
            >
              <span className="card-modulo__icone">
                <Icone nome={MODULOS[id].icone} tamanho={24} />
              </span>
              <span>
                <strong>{MODULOS[id].titulo}</strong>
                <small>Abrir planejamento mensal</small>
              </span>
              <Icone nome="chevron" tamanho={17} />
            </button>
          ))}
        </div>
      </section>
    </main>
  );

  const renderizarCrud = () => {
    const mapa = {
      filiais: {
        lista: planoAtivo?.filiais ?? [],
        singular: "filial",
        plural: "filiais",
        descricao: "Unidades usadas para distribuir os valores do orçamento.",
      },
      centros: {
        lista: planoAtivo?.centros ?? [],
        singular: "centro de custo",
        plural: "centros de custo",
        descricao: "Estrutura gerencial para classificação das despesas.",
      },
    };
    const dados = mapa[tela];
    return (
      <main className="conteudo">
        <Cabecalho
          titulo={MODULOS[tela].titulo}
          subtitulo={dados.descricao}
          onVoltar={voltar}
          acao={
            <Botao onClick={() => abrirModalSimples(tela)}>
              <Icone nome="plus" tamanho={18} />
              Adicionar {dados.singular}
            </Botao>
          }
        />
        <div className="lista-crud">
          <div className="lista-crud__topo">
            <span>Nome</span>
            <span>Ações</span>
          </div>
          {dados.lista.map((item, index) => (
            <div className="linha-crud" key={item.id}>
              <div className="linha-crud__nome">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.nome}</strong>
              </div>
              <div className="linha-crud__acoes">
                <button type="button" className="botao-icone" onClick={() => abrirModalSimples(tela, item)} aria-label="Renomear">
                  <Icone nome="edit" tamanho={18} />
                </button>
                <button
                  type="button"
                  className="botao-icone botao-icone--perigo"
                  onClick={() => setConfirmacao({ tipo: tela, id: item.id, nome: item.nome })}
                  aria-label="Excluir"
                >
                  <Icone nome="trash" tamanho={18} />
                </button>
              </div>
            </div>
          ))}
          {!dados.lista.length ? <EstadoVazio texto={`Adicione ${dados.singular}.`} /> : null}
        </div>
      </main>
    );
  };

  const renderizarVinculos = () => {
    const ehCanal = tela === "canais";
    const lista = ehCanal ? planoAtivo?.canais ?? [] : planoAtivo?.deducoes ?? [];
    const contas = ehCanal ? CONTAS_RECEITA : CONTAS_DEDUCAO;
    const titulo = ehCanal ? "Canais" : "Dedução";
    const descricao = ehCanal
      ? "Agrupe as contas de receita que compõem cada canal de venda."
      : "Agrupe separadamente as contas usadas nas deduções de vendas.";
    const contaMap = new Map(contas.map((conta) => [conta.id, conta]));
    return (
      <main className="conteudo">
        <Cabecalho
          titulo={titulo}
          subtitulo={descricao}
          onVoltar={voltar}
          acao={
            <Botao onClick={() => abrirModalSimples(tela)}>
              <Icone nome="plus" tamanho={18} />
              Adicionar {ehCanal ? "canal" : "dedução"}
            </Botao>
          }
        />
        <div className="vinculos-grid">
          {lista.map((item) => (
            <article className="card-vinculo" key={item.id}>
              <div className="card-vinculo__topo">
                <div>
                  <span>{ehCanal ? "Canal de venda" : "Grupo de dedução"}</span>
                  <h3>{item.nome}</h3>
                </div>
                <div className="linha-crud__acoes">
                  <button type="button" className="botao-icone" onClick={() => abrirModalSimples(tela, item)} aria-label="Editar">
                    <Icone nome="edit" tamanho={18} />
                  </button>
                  <button
                    type="button"
                    className="botao-icone botao-icone--perigo"
                    onClick={() => setConfirmacao({ tipo: tela, id: item.id, nome: item.nome })}
                    aria-label="Excluir"
                  >
                    <Icone nome="trash" tamanho={18} />
                  </button>
                </div>
              </div>
              <div className="card-vinculo__contas">
                {item.contas.length ? (
                  item.contas.map((contaId) => {
                    const conta = contaMap.get(contaId);
                    return conta ? (
                      <div className="conta-resumo" key={contaId}>
                        <code>{conta.codigo}</code>
                        <span>{conta.descricao}</span>
                      </div>
                    ) : null;
                  })
                ) : (
                  <p className="sem-contas">Nenhuma conta vinculada.</p>
                )}
              </div>
              <div className="card-vinculo__rodape">
                {item.contas.length} {item.contas.length === 1 ? "conta vinculada" : "contas vinculadas"}
              </div>
            </article>
          ))}
          {!lista.length ? <EstadoVazio texto={`Adicione ${ehCanal ? "um canal" : "uma dedução"}.`} /> : null}
        </div>
      </main>
    );
  };

  const renderizarOrcamento = () => {
    if (!planoAtivo) return null;
    const titulo = MODULOS[tela].titulo;
    const podeEditar = filialSelecionada !== "total" && canalSelecionado !== "total";
    const anos = Array.from(
      { length: planoAtivo.fim - planoAtivo.inicio + 1 },
      (_, index) => planoAtivo.inicio + index
    );
    const obterValorCanal = (id) => {
      const ids = id === "total" ? planoAtivo.canais.map((canal) => canal.id) : [id];
      return ids.reduce(
        (soma, canalId) =>
          soma +
          totalCanalNoAno(
            planoAtivo,
            tela,
            filialSelecionada,
            canalId,
            anoSelecionado
          ),
        0
      );
    };
    return (
      <main className="conteudo conteudo--orcamento">
        <Cabecalho
          titulo={titulo}
          subtitulo="Planejamento mensal, realizado e comparativo histórico."
          onVoltar={voltar}
        />
        <div className="filtros-orcamento">
          <label>
            <span>Filial</span>
            <select
              value={filialSelecionada}
              onChange={(event) => {
                setFilialSelecionada(event.target.value);
                setEditingCell(null);
              }}
            >
              <option value="total">Total — todas as filiais</option>
              {planoAtivo.filiais.map((filial) => (
                <option value={filial.id} key={filial.id}>
                  {filial.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Período</span>
            <select value={anoSelecionado} onChange={(event) => setAnoSelecionado(Number(event.target.value))}>
              {anos.map((ano) => (
                <option value={ano} key={ano}>
                  Janeiro/{ano} a Dezembro/{ano}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="orcamento-layout">
          <aside className="orcamento-lateral">
            <ListaSelecao
              titulo="Canais de venda"
              itens={canaisVisiveis}
              selecionado={canalSelecionado}
              onSelecionar={(id) => {
                setCanalSelecionado(id);
                setEditingCell(null);
              }}
              mostrarValores
              obterValor={obterValorCanal}
            />
            <label className="check-filtro">
              <input
                type="checkbox"
                checked={ocultarSemValores}
                onChange={(event) => {
                  setOcultarSemValores(event.target.checked);
                  if (
                    event.target.checked &&
                    canalSelecionado !== "total" &&
                    totalCanalNoAno(
                      planoAtivo,
                      tela,
                      filialSelecionada,
                      canalSelecionado,
                      anoSelecionado
                    ) === 0
                  ) {
                    setCanalSelecionado("total");
                  }
                }}
              />
              <span className="checkbox-visual">
                <Icone nome="check" tamanho={13} />
              </span>
              Ocultar canais sem valores
            </label>
          </aside>
          <section className="orcamento-dados">
            <div className={`dica-edicao ${podeEditar ? "is-ready" : ""}`}>
              <Icone nome="info" tamanho={18} />
              <span>
                {podeEditar
                  ? "Edição liberada: clique em um valor da coluna Planejado."
                  : "Para editar, selecione uma filial e um canal específicos."}
              </span>
            </div>
            <TabelaOrcamento
              linhas={linhasOrcamento}
              podeEditar={podeEditar}
              editingCell={editingCell}
              onIniciarEdicao={iniciarEdicao}
              onAlterarEdicao={(valor) => setEditingCell((atual) => ({ ...atual, valor }))}
              onConfirmarEdicao={confirmarEdicao}
              onCancelarEdicao={() => setEditingCell(null)}
              prefixoCelula={`${tela}|${filialSelecionada}|${canalSelecionado}|${anoSelecionado}`}
            />
          </section>
        </div>
      </main>
    );
  };

  const renderizarDeducaoVendas = () => {
    if (!planoAtivo) return null;
    const podeEditar =
      abaDeducao === "percentual" &&
      filialSelecionada !== "total" &&
      canalSelecionado !== "total" &&
      deducaoSelecionada !== "total";
    const anos = Array.from(
      { length: planoAtivo.fim - planoAtivo.inicio + 1 },
      (_, index) => planoAtivo.inicio + index
    );
    return (
      <main className="conteudo conteudo--orcamento">
        <Cabecalho
          titulo="Dedução de Vendas"
          subtitulo="Percentuais ponderados e valores calculados sobre a receita planejada."
          onVoltar={voltar}
        />
        <div className="filtros-orcamento">
          <label>
            <span>Filial</span>
            <select value={filialSelecionada} onChange={(event) => setFilialSelecionada(event.target.value)}>
              <option value="total">Total — todas as filiais</option>
              {planoAtivo.filiais.map((filial) => (
                <option value={filial.id} key={filial.id}>
                  {filial.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Período</span>
            <select value={anoSelecionado} onChange={(event) => setAnoSelecionado(Number(event.target.value))}>
              {anos.map((ano) => (
                <option value={ano} key={ano}>
                  Janeiro/{ano} a Dezembro/{ano}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="orcamento-layout orcamento-layout--deducao">
          <aside className="orcamento-lateral">
            <ListaSelecao
              titulo="Canais de venda"
              itens={canaisVisiveis}
              selecionado={canalSelecionado}
              onSelecionar={(id) => {
                setCanalSelecionado(id);
                setEditingCell(null);
              }}
            />
            <label className="check-filtro">
              <input
                type="checkbox"
                checked={ocultarSemValores}
                onChange={(event) => {
                  setOcultarSemValores(event.target.checked);
                  if (
                    event.target.checked &&
                    canalSelecionado !== "total" &&
                    totalCanalNoAno(
                      planoAtivo,
                      "vendas",
                      filialSelecionada,
                      canalSelecionado,
                      anoSelecionado
                    ) === 0
                  ) {
                    setCanalSelecionado("total");
                  }
                }}
              />
              <span className="checkbox-visual">
                <Icone nome="check" tamanho={13} />
              </span>
              Ocultar canais sem valores
            </label>
            <ListaSelecao
              titulo="Deduções"
              itens={planoAtivo.deducoes}
              selecionado={deducaoSelecionada}
              onSelecionar={(id) => {
                setDeducaoSelecionada(id);
                setEditingCell(null);
              }}
            />
          </aside>
          <section className="orcamento-dados">
            <div className="abas">
              <button
                type="button"
                className={abaDeducao === "percentual" ? "is-active" : ""}
                onClick={() => {
                  setAbaDeducao("percentual");
                  setEditingCell(null);
                }}
              >
                Percentual
              </button>
              <button
                type="button"
                className={abaDeducao === "total" ? "is-active" : ""}
                onClick={() => {
                  setAbaDeducao("total");
                  setEditingCell(null);
                }}
              >
                Total
              </button>
            </div>
            <div className={`dica-edicao ${podeEditar ? "is-ready" : ""}`}>
              <Icone nome="info" tamanho={18} />
              <span>
                {abaDeducao === "total"
                  ? "Somente leitura: total = percentual planejado × receita de vendas planejada."
                  : podeEditar
                    ? "Edição liberada: clique no percentual planejado."
                    : "Para editar, selecione filial, canal e dedução específicos."}
              </span>
            </div>
            <TabelaOrcamento
              linhas={linhasDeducao}
              formato={abaDeducao === "percentual" ? "percentual" : "moeda"}
              podeEditar={podeEditar}
              editingCell={editingCell}
              onIniciarEdicao={iniciarEdicao}
              onAlterarEdicao={(valor) => setEditingCell((atual) => ({ ...atual, valor }))}
              onConfirmarEdicao={confirmarEdicao}
              onCancelarEdicao={() => setEditingCell(null)}
              prefixoCelula={`deducao|${filialSelecionada}|${canalSelecionado}|${deducaoSelecionada}|${anoSelecionado}|${abaDeducao}`}
            />
          </section>
        </div>
      </main>
    );
  };

  const contasDoModal = modal?.tipo === "canais" ? CONTAS_RECEITA : CONTAS_DEDUCAO;

  return (
    <div className="app-orcamento">
      <header className="topbar">
        <div className="marca">
          <span className="marca__simbolo">KJ</span>
          <span className="marca__divisor" />
          <div>
            <strong>Planejamento</strong>
            <small>Orçamentário</small>
          </div>
        </div>
        <span className="empresa">{EMPRESA}</span>
      </header>

      {tela === "planos" ? renderizarPlanos() : null}
      {tela === "home" && planoAtivo ? renderizarHome() : null}
      {(tela === "filiais" || tela === "centros") && planoAtivo ? renderizarCrud() : null}
      {(tela === "canais" || tela === "deducao") && planoAtivo ? renderizarVinculos() : null}
      {(tela === "vendas" || tela === "operacionais") && planoAtivo ? renderizarOrcamento() : null}
      {tela === "deducaoVendas" && planoAtivo ? renderizarDeducaoVendas() : null}

      {drawerAberto ? (
        <>
          <div className="drawer-overlay" onClick={() => setDrawerAberto(false)} />
          <aside className="drawer" aria-label="Adicionar plano orçamentário">
            <div className="drawer__topo">
              <div>
                <span>Novo cenário</span>
                <h2>Adicionar plano orçamentário</h2>
              </div>
              <button type="button" className="botao-icone" onClick={() => setDrawerAberto(false)} aria-label="Fechar">
                <Icone nome="close" />
              </button>
            </div>
            <div className="drawer__conteudo">
              <label className="campo">
                <span>Nome <b>*</b></span>
                <input
                  value={novoPlano.nome}
                  onChange={(event) => {
                    setNovoPlano((atual) => ({ ...atual, nome: event.target.value }));
                    setErroPlano("");
                  }}
                  placeholder="Ex.: Orçamento Base 2027"
                  autoFocus
                />
              </label>
              <div className="campos-duplos">
                <label className="campo">
                  <span>Período de</span>
                  <input
                    type="number"
                    value={novoPlano.inicio}
                    onChange={(event) =>
                      setNovoPlano((atual) => ({ ...atual, inicio: event.target.value }))
                    }
                  />
                </label>
                <label className="campo">
                  <span>Até</span>
                  <input
                    type="number"
                    value={novoPlano.fim}
                    onChange={(event) =>
                      setNovoPlano((atual) => ({ ...atual, fim: event.target.value }))
                    }
                  />
                </label>
              </div>
              {erroPlano ? <p className="erro-campo">{erroPlano}</p> : null}
              <div className="drawer__nota">
                <Icone nome="info" tamanho={18} />
                <p>Cada plano mantém seus cadastros e valores de forma independente.</p>
              </div>
            </div>
            <div className="drawer__rodape">
              <Botao variante="secundario" onClick={() => setDrawerAberto(false)}>
                Cancelar
              </Botao>
              <Botao onClick={salvarNovoPlano}>Salvar plano</Botao>
            </div>
          </aside>
        </>
      ) : null}

      {modal ? (
        <Modal
          titulo={`${modal.id ? "Editar" : "Adicionar"} ${
            modal.tipo === "filiais"
              ? "filial"
              : modal.tipo === "centros"
                ? "centro de custo"
                : modal.tipo === "canais"
                  ? "canal"
                  : "dedução"
          }`}
          onFechar={() => setModal(null)}
          largura={modal.tipo === "canais" || modal.tipo === "deducao" ? "760px" : "520px"}
        >
          <div className="modal__conteudo">
            <label className="campo">
              <span>Nome</span>
              <input value={modalNome} onChange={(event) => setModalNome(event.target.value)} autoFocus />
            </label>
            {modal.tipo === "canais" || modal.tipo === "deducao" ? (
              <div className="contas-seletor">
                <div className="contas-seletor__topo">
                  <span>Contas disponíveis</span>
                  <small>{modalContas.length} selecionadas</small>
                </div>
                <div className="contas-seletor__lista">
                  {contasDoModal.map((conta) => {
                    const marcado = modalContas.includes(conta.id);
                    return (
                      <label className="conta-checkbox" key={conta.id}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() =>
                            setModalContas((atuais) =>
                              marcado
                                ? atuais.filter((id) => id !== conta.id)
                                : [...atuais, conta.id]
                            )
                          }
                        />
                        <span className="checkbox-visual">
                          <Icone nome="check" tamanho={13} />
                        </span>
                        <code>{conta.codigo}</code>
                        <span>{conta.descricao}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div className="modal__rodape">
            <Botao variante="secundario" onClick={() => setModal(null)}>
              Cancelar
            </Botao>
            <Botao onClick={salvarModal} disabled={!modalNome.trim()}>
              Salvar
            </Botao>
          </div>
        </Modal>
      ) : null}

      {confirmacao ? (
        <Modal titulo="Confirmar exclusão" onFechar={() => setConfirmacao(null)} largura="460px">
          <div className="confirmacao">
            <span className="confirmacao__icone">
              <Icone nome="trash" tamanho={23} />
            </span>
            <p>
              Deseja realmente excluir <strong>{confirmacao.nome}</strong>? Esta ação afeta apenas
              este plano orçamentário.
            </p>
          </div>
          <div className="modal__rodape">
            <Botao variante="secundario" onClick={() => setConfirmacao(null)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              onClick={confirmacao.tipo === "plano" ? () => excluirPlano(confirmacao.id) : confirmarExclusaoConfiguracao}
            >
              Excluir
            </Botao>
          </div>
        </Modal>
      ) : null}

      <style>{`
        :root {
          color-scheme: dark;
          --bg: #181818;
          --surface: #222222;
          --surface-2: #292929;
          --surface-3: #303030;
          --line: #3a3a3a;
          --line-soft: #303030;
          --text: #f4f2ef;
          --muted: #aaa7a2;
          --orange: #f05a28;
          --orange-dark: #c84218;
          --green: #4fc579;
          --red: #ff635d;
          --blue: #243b55;
          --gold: #b98b26;
          --gold-soft: rgba(185, 139, 38, .16);
        }

        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); }
        button, input, select { font: inherit; }
        button { color: inherit; }

        .app-orcamento {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          line-height: 1.45;
        }

        .topbar {
          position: fixed;
          inset: 0 0 auto 0;
          z-index: 40;
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          background: rgba(20,20,20,.96);
          border-bottom: 1px solid rgba(240,90,40,.75);
          backdrop-filter: blur(12px);
        }

        .marca { display: flex; align-items: center; gap: 14px; }
        .marca__simbolo {
          color: var(--orange);
          font-size: 25px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -1.5px;
        }
        .marca__divisor { width: 1px; height: 30px; background: #555; }
        .marca div { display: flex; flex-direction: column; line-height: 1.05; }
        .marca strong { font-size: 14px; letter-spacing: .01em; }
        .marca small { color: var(--muted); font-size: 11px; margin-top: 4px; }
        .empresa { font-size: 13px; font-weight: 700; letter-spacing: .045em; }

        .conteudo {
          width: min(1480px, calc(100% - 48px));
          margin: 0 auto;
          padding: 112px 0 56px;
          animation: entrada .28s ease both;
        }
        .conteudo--planos { max-width: 1260px; }
        .conteudo--orcamento { width: min(1540px, calc(100% - 40px)); }

        @keyframes entrada {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .cabecalho-pagina {
          min-height: 70px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 30px;
        }
        .cabecalho-pagina__texto { display: flex; align-items: flex-start; gap: 17px; }
        .cabecalho-pagina h1 {
          margin: 0;
          max-width: 840px;
          font-size: clamp(27px, 3vw, 38px);
          line-height: 1.12;
          letter-spacing: -.035em;
        }
        .cabecalho-pagina p { margin: 9px 0 0; color: var(--muted); font-size: 14px; }
        .botao-voltar {
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 1px solid var(--line);
          border-radius: 7px;
          background: #202020;
          cursor: pointer;
          transition: .18s ease;
        }
        .botao-voltar:hover { border-color: var(--orange); color: var(--orange); transform: translateX(-2px); }

        .botao {
          min-height: 42px;
          padding: 0 18px;
          border: 1px solid transparent;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          transition: .18s ease;
        }
        .botao:disabled { opacity: .42; cursor: not-allowed; }
        .botao--primario { background: var(--orange); color: white; }
        .botao--primario:hover:not(:disabled) { background: #ff6835; transform: translateY(-1px); }
        .botao--secundario { background: transparent; border-color: var(--line); color: var(--text); }
        .botao--secundario:hover { border-color: #666; background: #292929; }
        .botao--perigo { background: #c8403b; color: #fff; }
        .botao--perigo:hover { background: #e04a44; }
        .botao-icone {
          width: 36px;
          height: 36px;
          display: inline-grid;
          place-items: center;
          padding: 0;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: .18s ease;
        }
        .botao-icone:hover { color: var(--text); background: #323232; border-color: #555; }
        .botao-icone--perigo:hover { color: var(--red); border-color: rgba(255,99,93,.5); background: rgba(255,99,93,.08); }

        .planos-meta {
          display: flex;
          justify-content: space-between;
          padding: 14px 3px;
          border-top: 1px solid var(--line-soft);
          color: #85827e;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .07em;
        }
        .grid-planos { display: grid; gap: 13px; margin-top: 8px; }
        .card-plano {
          position: relative;
          min-height: 104px;
          display: flex;
          background: var(--surface);
          border: 1px solid var(--line-soft);
          border-left: 4px solid var(--green);
          border-radius: 8px;
          overflow: hidden;
          transition: .2s ease;
        }
        .card-plano:hover { border-color: #4a4a4a; border-left-color: #69dc8e; transform: translateY(-1px); }
        .card-plano__abrir {
          width: 100%;
          display: grid;
          grid-template-columns: 52px 1fr auto;
          align-items: center;
          gap: 18px;
          padding: 20px 76px 20px 23px;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .card-plano__icone {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          color: var(--green);
          background: rgba(79,197,121,.09);
          border: 1px solid rgba(79,197,121,.19);
          border-radius: 7px;
        }
        .card-plano__texto { display: flex; flex-direction: column; gap: 7px; }
        .card-plano__texto strong { font-size: 17px; letter-spacing: -.01em; }
        .card-plano__texto small { color: var(--muted); font-size: 13px; }
        .card-plano__seta { color: #777; transition: .18s ease; }
        .card-plano:hover .card-plano__seta { color: var(--green); transform: translateX(3px); }
        .card-plano__excluir {
          position: absolute;
          right: 22px;
          top: 50%;
          width: 36px;
          height: 36px;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          padding: 0;
          border: 0;
          background: transparent;
          color: #777;
          cursor: pointer;
          border-radius: 6px;
        }
        .card-plano__excluir:hover { color: var(--red); background: rgba(255,99,93,.08); }

        .secao-modulos { padding: 26px 0 38px; border-top: 1px solid var(--line-soft); }
        .secao-modulos + .secao-modulos { margin-top: 12px; }
        .secao-modulos__cabecalho {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 30px;
          margin-bottom: 20px;
        }
        .secao-modulos__cabecalho > div { display: flex; align-items: baseline; gap: 14px; }
        .secao-modulos h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
        .secao-modulos__cabecalho p { margin: 0; color: var(--muted); font-size: 13px; }
        .numero-secao { color: var(--orange); font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .grid-modulos { display: grid; gap: 13px; }
        .grid-modulos--config { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .grid-modulos--orcamento { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .card-modulo {
          min-height: 112px;
          display: grid;
          grid-template-columns: 46px 1fr auto;
          align-items: center;
          gap: 15px;
          padding: 20px;
          background: var(--surface);
          border: 1px solid var(--line-soft);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          transition: .2s ease;
          overflow: hidden;
        }
        .card-modulo:hover { transform: translateY(-2px); border-color: #555; background: #262626; }
        .card-modulo__icone {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 7px;
        }
        .card-modulo > span:nth-child(2) { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .card-modulo strong { font-size: 15px; }
        .card-modulo small { color: var(--muted); font-size: 12px; }
        .card-modulo > svg { color: #777; }
        .card-modulo--config { border-top: 3px solid #385a80; }
        .card-modulo--config .card-modulo__icone { color: #80a8d6; background: rgba(56,90,128,.22); }
        .card-modulo--receita { border-top: 3px solid var(--green); }
        .card-modulo--receita .card-modulo__icone { color: var(--green); background: rgba(79,197,121,.11); }
        .card-modulo--despesa { border-top: 3px solid var(--red); }
        .card-modulo--despesa .card-modulo__icone { color: var(--red); background: rgba(255,99,93,.1); }

        .lista-crud {
          max-width: 980px;
          margin: 0 auto;
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: var(--surface);
        }
        .lista-crud__topo, .linha-crud {
          display: grid;
          grid-template-columns: 1fr 120px;
          align-items: center;
        }
        .lista-crud__topo {
          min-height: 44px;
          padding: 0 20px;
          background: #1d1d1d;
          color: #85827e;
          font-size: 11px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: .08em;
          border-bottom: 1px solid var(--line);
        }
        .lista-crud__topo span:last-child { text-align: right; }
        .linha-crud { min-height: 68px; padding: 0 16px 0 20px; border-bottom: 1px solid var(--line-soft); }
        .linha-crud:last-child { border-bottom: 0; }
        .linha-crud:hover { background: #252525; }
        .linha-crud__nome { display: flex; align-items: center; gap: 18px; }
        .linha-crud__nome > span { color: #73706d; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .linha-crud__nome strong { font-size: 14px; }
        .linha-crud__acoes { display: flex; justify-content: flex-end; gap: 7px; }

        .vinculos-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .card-vinculo {
          display: flex;
          flex-direction: column;
          min-height: 260px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .card-vinculo__topo {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 21px;
          border-bottom: 1px solid var(--line-soft);
        }
        .card-vinculo__topo span {
          color: var(--orange);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .card-vinculo h3 { margin: 7px 0 0; font-size: 17px; }
        .card-vinculo__contas { flex: 1; padding: 12px 20px; }
        .conta-resumo {
          display: grid;
          grid-template-columns: 114px 1fr;
          gap: 13px;
          align-items: baseline;
          padding: 8px 0;
          border-bottom: 1px solid #303030;
        }
        .conta-resumo:last-child { border-bottom: 0; }
        .conta-resumo code { color: var(--orange); font-size: 11px; }
        .conta-resumo span { color: #c4c1bd; font-size: 11px; line-height: 1.35; }
        .card-vinculo__rodape {
          padding: 11px 20px;
          background: #1e1e1e;
          color: #85827e;
          font-size: 11px;
        }
        .sem-contas { color: var(--muted); font-style: italic; }

        .filtros-orcamento {
          display: flex;
          align-items: flex-end;
          gap: 14px;
          padding: 0 0 20px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--line);
        }
        .filtros-orcamento label { width: min(330px, 35vw); display: flex; flex-direction: column; gap: 7px; }
        .filtros-orcamento label > span, .campo > span {
          color: #bbb8b4;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: .055em;
          text-transform: uppercase;
        }
        select, .campo input {
          width: 100%;
          height: 43px;
          padding: 0 13px;
          color: var(--text);
          background: #202020;
          border: 1px solid #454545;
          border-radius: 6px;
          outline: none;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        select:focus, .campo input:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(240,90,40,.1); }

        .orcamento-layout {
          display: grid;
          grid-template-columns: 275px minmax(760px, 1fr);
          gap: 20px;
          align-items: start;
        }
        .orcamento-lateral { display: flex; flex-direction: column; gap: 14px; }
        .painel-selecao {
          overflow: hidden;
          background: #1e1e1e;
          border: 1px solid var(--line);
          border-radius: 7px;
        }
        .painel-selecao h3 {
          margin: 0;
          padding: 15px 16px;
          font-size: 13px;
          border-bottom: 1px solid var(--line);
        }
        .selecao-item {
          position: relative;
          width: 100%;
          min-height: 47px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 14px 10px 16px;
          background: transparent;
          border: 0;
          border-bottom: 1px solid #303030;
          text-align: left;
          cursor: pointer;
          transition: .15s ease;
        }
        .selecao-item:last-child { border-bottom: 0; }
        .selecao-item:hover { background: #282828; }
        .selecao-item.is-active { background: var(--gold-soft); color: #f4d88e; }
        .selecao-item.is-active::before {
          content: "";
          position: absolute;
          left: 0;
          inset-block: 0;
          width: 3px;
          background: #dba62f;
        }
        .selecao-item span { font-size: 12px; font-weight: 650; }
        .selecao-item b { color: #bcb9b5; font-size: 10px; font-weight: 550; font-variant-numeric: tabular-nums; }
        .selecao-item.is-active b { color: #ecd58f; }

        .check-filtro, .conta-checkbox {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .check-filtro {
          min-height: 48px;
          padding: 10px 14px;
          color: #bbb8b4;
          font-size: 11px;
          background: #1e1e1e;
          border: 1px solid var(--line);
          border-radius: 7px;
        }
        .check-filtro input, .conta-checkbox input { position: absolute; opacity: 0; pointer-events: none; }
        .checkbox-visual {
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          color: transparent;
          border: 1px solid #686868;
          border-radius: 3px;
          background: #1c1c1c;
        }
        input:checked + .checkbox-visual { background: var(--orange); border-color: var(--orange); color: #fff; }

        .orcamento-dados { min-width: 0; }
        .dica-edicao {
          min-height: 40px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 9px 12px;
          margin-bottom: 10px;
          color: #aaa7a2;
          background: #202020;
          border: 1px solid #353535;
          border-radius: 6px;
          font-size: 11px;
        }
        .dica-edicao svg { color: #8b8884; }
        .dica-edicao.is-ready { color: #bce7ca; border-color: rgba(79,197,121,.24); background: rgba(79,197,121,.055); }
        .dica-edicao.is-ready svg { color: var(--green); }

        .abas {
          display: flex;
          gap: 24px;
          height: 42px;
          margin-bottom: 10px;
          border-bottom: 1px solid var(--line);
        }
        .abas button {
          position: relative;
          padding: 0 2px 11px;
          color: #85827e;
          background: transparent;
          border: 0;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .abas button.is-active { color: var(--text); }
        .abas button.is-active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 2px;
          background: var(--orange);
        }

        .tabela-wrap {
          width: 100%;
          overflow: auto;
          border: 1px solid #414141;
          border-radius: 7px;
          background: #1d1d1d;
        }
        .tabela-orcamento {
          width: 100%;
          min-width: 790px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        .tabela-orcamento th, .tabela-orcamento td {
          height: 43px;
          padding: 8px 12px;
          border-right: 1px solid #383838;
          border-bottom: 1px solid #383838;
          text-align: right;
          white-space: nowrap;
        }
        .tabela-orcamento tr > *:last-child { border-right: 0; }
        .tabela-orcamento tbody tr:last-child > * { border-bottom: 0; }
        .tabela-orcamento thead th {
          height: 46px;
          color: #ddd9d5;
          background: #242424;
          font-size: 11px;
          font-weight: 750;
        }
        .tabela-orcamento th:first-child { width: 110px; text-align: left; }
        .tabela-orcamento tbody th { color: #cfcbc7; font-weight: 500; }
        .tabela-orcamento tbody tr:hover:not(.linha-total):not(.linha-media) { background: #222; }
        .tabela-orcamento td { color: #d5d1cd; }
        .tabela-orcamento .positivo { color: var(--green); }
        .tabela-orcamento .negativo { color: var(--red); }
        .linha-total th, .linha-total td { background: #242424; font-weight: 750 !important; border-top: 1px solid #555; }
        .linha-media th, .linha-media td { background: #202020; color: #aaa7a2; }
        .celula-editavel {
          position: relative;
          color: #fff !important;
          cursor: text;
          background: rgba(240,90,40,.025);
        }
        .celula-editavel::after {
          content: "";
          position: absolute;
          inset: 5px;
          border: 1px dashed rgba(240,90,40,.22);
          border-radius: 3px;
          pointer-events: none;
        }
        .celula-editavel:hover { background: rgba(240,90,40,.08); }
        .input-inline {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 31px;
          padding: 0 8px;
          color: #fff;
          background: #161616;
          border: 1px solid var(--orange);
          border-radius: 3px;
          outline: none;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .drawer-overlay, .overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(0,0,0,.68);
          backdrop-filter: blur(2px);
          animation: fade .18s ease both;
        }
        .drawer {
          position: fixed;
          inset: 0 0 0 auto;
          z-index: 90;
          width: min(470px, 94vw);
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border-left: 1px solid #484848;
          box-shadow: -20px 0 50px rgba(0,0,0,.35);
          animation: drawerIn .26s ease both;
        }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes drawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .drawer__topo, .modal__topo {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 24px;
          border-bottom: 1px solid var(--line);
        }
        .drawer__topo > div > span {
          color: var(--orange);
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .1em;
        }
        .drawer h2, .modal h2 { margin: 6px 0 0; font-size: 20px; letter-spacing: -.02em; }
        .drawer__conteudo { flex: 1; padding: 28px 24px; overflow: auto; }
        .campo { display: flex; flex-direction: column; gap: 8px; }
        .campo > span b { color: var(--orange); }
        .campos-duplos { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
        .drawer__nota {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px;
          margin-top: 25px;
          color: #aaa7a2;
          background: #1d1d1d;
          border: 1px solid #353535;
          border-radius: 6px;
          font-size: 12px;
        }
        .drawer__nota svg { flex: 0 0 auto; color: var(--orange); }
        .drawer__nota p { margin: 0; }
        .drawer__rodape, .modal__rodape {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 17px 24px;
          border-top: 1px solid var(--line);
          background: #1d1d1d;
        }
        .erro-campo { margin: 12px 0 0; color: var(--red); font-size: 12px; }

        .overlay {
          display: grid;
          place-items: center;
          padding: 22px;
          z-index: 100;
        }
        .modal {
          width: 100%;
          max-height: min(86vh, 780px);
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border: 1px solid #4a4a4a;
          border-radius: 9px;
          box-shadow: 0 24px 80px rgba(0,0,0,.5);
          animation: modalIn .2s ease both;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(.98) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal__topo { padding: 20px 22px; }
        .modal__topo h2 { margin: 3px 0 0; }
        .modal__conteudo { padding: 22px; overflow: auto; }
        .contas-seletor { margin-top: 22px; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
        .contas-seletor__topo {
          min-height: 45px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 14px;
          background: #1d1d1d;
          border-bottom: 1px solid var(--line);
        }
        .contas-seletor__topo span { font-size: 12px; font-weight: 750; }
        .contas-seletor__topo small { color: var(--orange); }
        .contas-seletor__lista { max-height: 370px; overflow: auto; }
        .conta-checkbox {
          display: grid;
          grid-template-columns: 18px 118px 1fr;
          min-height: 45px;
          padding: 8px 13px;
          border-bottom: 1px solid #303030;
        }
        .conta-checkbox:last-child { border-bottom: 0; }
        .conta-checkbox:hover { background: #282828; }
        .conta-checkbox code { color: var(--orange); font-size: 11px; }
        .conta-checkbox > span:last-child { color: #c5c2be; font-size: 11px; }

        .confirmacao {
          display: flex;
          align-items: flex-start;
          gap: 15px;
          padding: 26px 24px;
        }
        .confirmacao__icone {
          flex: 0 0 auto;
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          color: var(--red);
          background: rgba(255,99,93,.1);
          border-radius: 50%;
        }
        .confirmacao p { margin: 3px 0 0; color: #c4c1bd; }
        .confirmacao strong { color: #fff; }

        .estado-vazio {
          grid-column: 1 / -1;
          min-height: 250px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border: 1px dashed #424242;
          border-radius: 8px;
          color: var(--muted);
        }
        .estado-vazio__icone {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          margin-bottom: 13px;
          color: var(--orange);
          background: rgba(240,90,40,.08);
          border-radius: 50%;
        }
        .estado-vazio strong { color: #d8d5d1; }
        .estado-vazio p { margin: 7px 0 0; }

        @media (max-width: 1100px) {
          .grid-modulos--config { grid-template-columns: repeat(2, 1fr); }
          .orcamento-layout { grid-template-columns: 235px minmax(720px, 1fr); }
          .conteudo--orcamento { overflow: hidden; }
          .orcamento-layout { overflow-x: auto; padding-bottom: 10px; }
        }

        @media (max-width: 760px) {
          .topbar { height: 60px; padding: 0 16px; }
          .marca__divisor, .marca div { display: none; }
          .empresa { max-width: 240px; font-size: 10px; text-align: right; }
          .conteudo, .conteudo--orcamento { width: calc(100% - 28px); padding-top: 88px; }
          .cabecalho-pagina { flex-direction: column; margin-bottom: 22px; }
          .cabecalho-pagina h1 { font-size: 27px; }
          .cabecalho-pagina > .botao { width: 100%; }
          .planos-meta span:last-child { display: none; }
          .card-plano__abrir { grid-template-columns: 42px 1fr; gap: 13px; padding: 17px 55px 17px 14px; }
          .card-plano__icone { width: 42px; height: 42px; }
          .card-plano__seta { display: none; }
          .card-plano__texto strong { font-size: 14px; }
          .card-plano__texto small { font-size: 11px; }
          .card-plano__excluir { right: 10px; }
          .secao-modulos__cabecalho { align-items: flex-start; }
          .secao-modulos__cabecalho p { display: none; }
          .grid-modulos--config, .grid-modulos--orcamento { grid-template-columns: 1fr; }
          .card-modulo { min-height: 88px; }
          .vinculos-grid { grid-template-columns: 1fr; }
          .conta-resumo { grid-template-columns: 1fr; gap: 3px; }
          .lista-crud__topo, .linha-crud { grid-template-columns: 1fr auto; }
          .filtros-orcamento { align-items: stretch; flex-direction: column; }
          .filtros-orcamento label { width: 100%; }
          .orcamento-layout {
            display: block;
            overflow: visible;
            padding-bottom: 0;
          }
          .orcamento-lateral { margin-bottom: 16px; }
          .orcamento-dados { width: 100%; }
          .tabela-wrap { max-width: 100%; }
          .drawer__topo, .drawer__conteudo { padding-left: 18px; padding-right: 18px; }
          .conta-checkbox { grid-template-columns: 18px 1fr; }
          .conta-checkbox > span:last-child { grid-column: 2; }
          .overlay { padding: 10px; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
        }
      `}</style>
    </div>
  );
}
