import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api.js";
import { CATALOGO_VAZIO, indexarContas } from "../dados/contas.js";
import { REALIZADO_VAZIO, indexarRealizado } from "../dados/realizado.js";

// ============================================================================
// Dados do ERP
//
// Filiais, centros de custo e a lista de visões contábeis são carregados uma
// vez. Plano de contas e realizado dependem da visão contábil escolhida, então
// ficam em cache por chave — trocar de módulo não deve refazer a consulta.
// ============================================================================

export function useCadastrosDoErp() {
  const [estado, setEstado] = useState({
    carregando: true,
    erro: null,
    filiais: [],
    centros: [],
    visoesContabeis: [],
  });

  const carregar = useCallback(async () => {
    setEstado((atual) => ({ ...atual, carregando: true, erro: null }));
    try {
      const [filiais, centros, visoesContabeis] = await Promise.all([
        api.filiais(),
        api.centrosDeCusto(),
        api.visoesContabeis(),
      ]);
      setEstado({ carregando: false, erro: null, filiais, centros, visoesContabeis });
    } catch (erro) {
      setEstado((atual) => ({ ...atual, carregando: false, erro: erro.message }));
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { ...estado, recarregar: carregar };
}

// Cache genérico por chave, com marcação antes de resolver para o StrictMode não
// disparar a mesma consulta duas vezes.
function useCachePorChave(buscar, vazio) {
  const cache = useRef(new Map());
  const geracao = useRef(0);
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const garantir = useCallback(
    (chaves) => {
      const pendentes = chaves.filter((chave) => chave != null && !cache.current.has(chave));
      if (!pendentes.length) return;
      const geracaoDaBusca = geracao.current;

      setCarregando(true);
      setErro(null);
      pendentes.forEach((chave) => cache.current.set(chave, vazio));

      Promise.all(
        pendentes.map(async (chave) => {
          const resultado = await buscar(chave);
          if (geracao.current === geracaoDaBusca) cache.current.set(chave, resultado);
        })
      )
        .then(() => setVersao((atual) => atual + 1))
        .catch((falha) => {
          // Sem o descarte, a chave ficaria em cache como vazia e nunca
          // recarregaria.
          if (geracao.current === geracaoDaBusca) {
            pendentes.forEach((chave) => cache.current.delete(chave));
            setErro(falha.message);
          }
        })
        .finally(() => {
          if (geracao.current === geracaoDaBusca) setCarregando(false);
        });
    },
    [buscar, vazio]
  );

  const ler = useCallback((chave) => cache.current.get(chave) ?? vazio, [vazio]);

  const limpar = useCallback((chaves = null) => {
    geracao.current += 1;
    if (Array.isArray(chaves)) chaves.forEach((chave) => cache.current.delete(chave));
    else cache.current.clear();
    setCarregando(false);
    setErro(null);
    setVersao((atual) => atual + 1);
  }, []);

  return { garantir, ler, limpar, carregando, erro, versao };
}

// Plano de contas da visão contábil escolhida.
export function useContas(visaoContabil) {
  const buscar = useCallback(async (visao) => indexarContas(await api.contas(visao)), []);
  const { garantir, ler, limpar, carregando, erro, versao } = useCachePorChave(
    buscar,
    CATALOGO_VAZIO
  );

  useEffect(() => {
    if (visaoContabil) garantir([visaoContabil]);
  }, [visaoContabil, garantir]);

  const recarregar = useCallback(() => {
    if (!visaoContabil) return;
    limpar([visaoContabil]);
    garantir([visaoContabil]);
  }, [visaoContabil, limpar, garantir]);

  return useMemo(
    () => ({
      catalogo: visaoContabil ? ler(visaoContabil) : CATALOGO_VAZIO,
      carregando,
      erro,
      recarregar,
    }),
    // `versao` entra de propósito: o cache é um ref e não dispara recálculo.
    [visaoContabil, ler, recarregar, carregando, erro, versao]
  );
}

// Realizado do ano e do anterior, para a coluna comparativa.
export function useRealizado(ano, visaoContabil) {
  const buscar = useCallback(async (chave) => {
    const [visao, valor] = chave.split("|");
    // A visão contábil vai junto: é ela que diz de qual receita é cada centro de
    // custo, e o índice já sai com esse recorte pronto.
    return indexarRealizado(await api.realizado(Number(valor), visao), visao);
  }, []);
  const { garantir, ler, limpar, carregando, erro, versao } = useCachePorChave(
    buscar,
    REALIZADO_VAZIO
  );

  const chaves = useMemo(() => {
    if (!Number.isInteger(ano) || !visaoContabil) return [];
    return [`${visaoContabil}|${ano}`, `${visaoContabil}|${ano - 1}`];
  }, [ano, visaoContabil]);

  useEffect(() => {
    if (chaves.length) garantir(chaves);
  }, [chaves, garantir]);

  const recarregar = useCallback(() => {
    if (!chaves.length) return;
    limpar(chaves);
    garantir(chaves);
  }, [chaves, limpar, garantir]);

  return useMemo(
    () => ({
      carregando,
      erro,
      recarregar,
      doAno: chaves[0] ? ler(chaves[0]) : REALIZADO_VAZIO,
      doAnoAnterior: chaves[1] ? ler(chaves[1]) : REALIZADO_VAZIO,
    }),
    [chaves, ler, recarregar, carregando, erro, versao]
  );
}
