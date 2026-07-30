import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api.js";
import { CATALOGO_VAZIO, indexarContas } from "../dados/contas.js";
import { REALIZADO_VAZIO, indexarRealizado } from "../dados/realizado.js";

// ============================================================================
// Dados do ERP
//
// Plano de contas, filiais e centros de custo são carregados uma vez. O
// realizado é por ano e fica em cache: a tabela precisa do ano selecionado e do
// anterior ao mesmo tempo, e trocar de módulo não deve refazer a consulta.
// ============================================================================

export function useCadastrosDoErp() {
  const [estado, setEstado] = useState({
    carregando: true,
    erro: null,
    catalogo: CATALOGO_VAZIO,
    filiais: [],
    centros: [],
  });

  const carregar = useCallback(async () => {
    setEstado((atual) => ({ ...atual, carregando: true, erro: null }));
    try {
      const [contas, filiais, centros] = await Promise.all([
        api.contas(),
        api.filiais(),
        api.centrosDeCusto(),
      ]);
      setEstado({
        carregando: false,
        erro: null,
        catalogo: indexarContas(contas),
        filiais,
        centros,
      });
    } catch (erro) {
      setEstado((atual) => ({ ...atual, carregando: false, erro: erro.message }));
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { ...estado, recarregar: carregar };
}

// Índices de realizado para o ano e para o anterior (coluna comparativa).
export function useRealizado(ano) {
  const cache = useRef(new Map());
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const anos = useMemo(() => (Number.isInteger(ano) ? [ano, ano - 1] : []), [ano]);

  useEffect(() => {
    const pendentes = anos.filter((valor) => !cache.current.has(valor));
    if (!pendentes.length) return;

    let ativo = true;
    setCarregando(true);
    setErro(null);

    Promise.all(
      pendentes.map(async (valor) => {
        // Marca antes de resolver para não disparar a mesma consulta duas vezes
        // (StrictMode roda o efeito em dobro no desenvolvimento).
        cache.current.set(valor, REALIZADO_VAZIO);
        const linhas = await api.realizado(valor);
        cache.current.set(valor, indexarRealizado(linhas));
      })
    )
      .then(() => {
        if (!ativo) return;
        setVersao((atual) => atual + 1);
      })
      .catch((falha) => {
        if (!ativo) return;
        // Sem o descarte, o ano ficaria em cache como vazio e nunca recarregaria.
        pendentes.forEach((valor) => cache.current.delete(valor));
        setErro(falha.message);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [anos]);

  return useMemo(
    () => ({
      carregando,
      erro,
      doAno: cache.current.get(ano) ?? REALIZADO_VAZIO,
      doAnoAnterior: cache.current.get(ano - 1) ?? REALIZADO_VAZIO,
    }),
    // `versao` entra de propósito: o cache é um ref e não dispara recálculo.
    [ano, carregando, erro, versao]
  );
}
