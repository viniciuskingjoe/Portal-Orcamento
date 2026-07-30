import sql from "mssql";

// ============================================================================
// Pool único de conexões (PADRAO-PROJETOS-AKR.md §5)
//
// Regras que não podem ser afrouxadas:
//   - parâmetro SEMPRE por bind (`request.input`), nunca concatenado na query;
//   - `Date` tipado como `DateTime2(3)` no bind — o driver infere `DATETIME`
//     (precisão ~3,3 ms) e arredonda, o que quebra qualquer comparação entre
//     valor gravado e valor lido;
//   - dados do ERP (Linx) só por `SELECT` em view; nunca alterar tabela do ERP.
// ============================================================================

function obrigatorio(nome) {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Copie .env.example para .env e preencha.`
    );
  }
  return valor;
}

function configuracao() {
  return {
    server: obrigatorio("DB_HOST"),
    database: obrigatorio("DB_NAME"),
    user: obrigatorio("DB_USER"),
    password: obrigatorio("DB_PASS"),
    port: Number(process.env.DB_PORT ?? 1433),
    options: {
      // Instância interna com certificado próprio; a conexão continua criptografada.
      encrypt: process.env.DB_ENCRYPT !== "false",
      trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: Number(process.env.DB_TIMEOUT ?? 30000),
  };
}

let poolPromise = null;

export function pool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(configuracao())
      .connect()
      .catch((erro) => {
        // Sem isto uma falha na primeira conexão ficaria em cache para sempre e
        // toda requisição seguinte rejeitaria com o erro antigo.
        poolPromise = null;
        throw erro;
      });
  }
  return poolPromise;
}

// Tipa o bind. Datas viram DateTime2(3) por decisão explícita, não por inferência.
function aplicarParametros(request, parametros) {
  Object.entries(parametros).forEach(([nome, valor]) => {
    if (valor instanceof Date) request.input(nome, sql.DateTime2(3), valor);
    else request.input(nome, valor);
  });
}

export async function query(texto, parametros = {}) {
  const conexao = await pool();
  const request = conexao.request();
  aplicarParametros(request, parametros);
  const resultado = await request.query(texto);
  return resultado.recordset ?? [];
}

export async function queryOne(texto, parametros = {}) {
  const linhas = await query(texto, parametros);
  return linhas[0] ?? null;
}

export async function transaction(executar) {
  const conexao = await pool();
  const transacao = new sql.Transaction(conexao);
  await transacao.begin();
  try {
    const resultado = await executar({
      query: async (texto, parametros = {}) => {
        const request = new sql.Request(transacao);
        aplicarParametros(request, parametros);
        const saida = await request.query(texto);
        return saida.recordset ?? [];
      },
    });
    await transacao.commit();
    return resultado;
  } catch (erro) {
    await transacao.rollback();
    throw erro;
  }
}

export async function encerrar() {
  if (!poolPromise) return;
  const conexao = await poolPromise.catch(() => null);
  poolPromise = null;
  if (conexao) await conexao.close();
}

export { sql };
