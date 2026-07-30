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
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const garantir = useCallback(
    (chaves) => {
      const pendentes = chaves.filter((chave) => chave != null && !cache.current.has(chave));
      if (!pendentes.length) return;

      setCarregando(true);
      setErro(null);
      pendentes.forEach((chave) => cache.current.set(chave, vazio));

      Promise.all(
        pendentes.map(async (chave) => {
          cache.current.set(chave, await buscar(chave));
        })
      )
        .then(() => setVersao((atual) => atual + 1))
        .catch((falha) => {
          // Sem o descarte, a chave ficaria em cache como vazia e nunca
          // recarregaria.
          pendentes.forEach((chave) => cache.current.delete(chave));
          setErro(falha.message);
        })
        .finally(() => setCarregando(false));
    },
    [buscar, vazio]
  );

  const ler = useCallback((chave) => cache.current.get(chave) ?? vazio, [vazio]);

  const limpar = useCallback(() => {
    cache.current.clear();
    setVersao((atual) => atual + 1);
  }, []);

  return { garantir, ler, limpar, carregando, erro, versao };
}

// Plano de contas da visão contábil escolhida.
export function useContas(visaoContabil) {
  const buscar = useCallback(async (visao) => indexarContas(await api.contas(visao)), []);
  const cache = useCachePorChave(buscar, CATALOGO_VAZIO);

  useEffect(() => {
    if (visaoContabil) cache.garantir([visaoContabil]);
  }, [visaoContabil, cache]);

  return useMemo(
    () => ({
      catalogo: visaoContabil ? cache.ler(visaoContabil) : CATALOGO_VAZIO,
      carregando: cache.carregando,
      erro: cache.erro,
      recarregar: cache.limpar,
    }),
    // `versao` entra de propósito: o cache é um ref e não dispara recálculo.
    [visaoContabil, cache, cache.versao]
  );
}

// Realizado do ano e do anterior, para a coluna comparativa.
export function useRealizado(ano, visaoContabil) {
  const buscar = useCallback(async (chave) => {
    const [visao, valor] = chave.split("|");
    return indexarRealizado(await api.realizado(Number(valor), visao));
  }, []);
  const cache = useCachePorChave(buscar, REALIZADO_VAZIO);

  const chaves = useMemo(() => {
    if (!Number.isInteger(ano) || !visaoContabil) return [];
    return [`${visaoContabil}|${ano}`, `${visaoContabil}|${ano - 1}`];
  }, [ano, visaoContabil]);

  useEffect(() => {
    if (chaves.length) cache.garantir(chaves);
  }, [chaves, cache]);

  return useMemo(
    () => ({
      carregando: cache.carregando,
      erro: cache.erro,
      doAno: chaves[0] ? cache.ler(chaves[0]) : REALIZADO_VAZIO,
      doAnoAnterior: chaves[1] ? cache.ler(chaves[1]) : REALIZADO_VAZIO,
    }),
    [chaves, cache, cache.versao]
  );
}
