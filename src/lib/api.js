// Cliente da API do portal. O Vite encaminha /api/* para o backend, então em
// dev e em produção o caminho é o mesmo — sem base URL configurável, sem CORS.

class ErroDaApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = "ErroDaApi";
    this.status = status;
  }
}

async function buscar(caminho, parametros) {
  const url = new URL(caminho, window.location.origin);
  Object.entries(parametros ?? {}).forEach(([chave, valor]) => {
    if (valor != null) url.searchParams.set(chave, String(valor));
  });

  let resposta;
  try {
    resposta = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (erro) {
    // API no ar é pré-requisito: sem ela não há dado nenhum, e a mensagem
    // genérica de rede não diz o que fazer.
    throw new ErroDaApi(`Não foi possível falar com a API (${erro.message}). Ela está rodando? \`npm run api\``, 0);
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroDaApi(corpo?.erro ?? `Erro ${resposta.status} em ${caminho}`, resposta.status);
  }
  return corpo;
}

export const api = {
  health: () => buscar("/api/health"),
  contas: () => buscar("/api/contas"),
  filiais: () => buscar("/api/filiais"),
  centrosDeCusto: () => buscar("/api/centros-de-custo"),
  realizado: (ano, filialId) => buscar("/api/realizado", { ano, filial: filialId }),
};

export { ErroDaApi };
