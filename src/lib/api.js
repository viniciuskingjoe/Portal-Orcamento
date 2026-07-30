// Cliente da API do portal. O Vite encaminha /api/* para o backend, então em
// dev e em produção o caminho é o mesmo — sem base URL configurável, sem CORS.

const RODAR_API =
  "A API não está respondendo. Pare o servidor e rode `npm run dev`, que sobe a API junto com o front.";

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
    throw new ErroDaApi(`${RODAR_API} (${erro.message})`, 0);
  }

  // Lê como texto para poder distinguir "a API respondeu um erro" de "quem
  // respondeu não foi a API". Quando o backend está fora, o proxy do Vite
  // devolve 500 com HTML — e `Erro 500 em /api/contas` não diz o que fazer.
  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    if (corpo?.erro) throw new ErroDaApi(corpo.erro, resposta.status);
    // Sem JSON no corpo, o erro não veio do nosso handler: é o proxy sem alcançar
    // o backend, ou um intermediário no caminho.
    throw new ErroDaApi(`${RODAR_API} (HTTP ${resposta.status} em ${caminho})`, resposta.status);
  }

  if (corpo == null) {
    throw new ErroDaApi(`Resposta inesperada em ${caminho}: não era JSON.`, resposta.status);
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
