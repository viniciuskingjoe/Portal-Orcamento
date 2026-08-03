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

// Aceita os nomes `SQLSERVER_*` (padrão dos outros portais) e cai nos `DB_*`
// como alternativa. Valor vazio conta como não definido: `VAR=` no .env é
// descuido comum, e tratar "" como valor faria o pool subir com host vazio.
function ler(nomes) {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor != null && valor.trim() !== "") return valor.trim();
  }
  return null;
}

function obrigatorio(nomes) {
  const valor = ler(nomes);
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nomes[0]} não definida. Copie .env.example para .env e preencha.`
    );
  }
  return valor;
}

function booleano(nomes, padrao) {
  const valor = ler(nomes);
  if (valor == null) return padrao;
  return !["false", "0", "no", "nao", "não"].includes(valor.toLowerCase());
}

function numero(nomes, padrao) {
  const valor = Number(ler(nomes));
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

// Reclama de TODAS as que faltam de uma vez. Parando na primeira, quem está
// configurando descobre uma por vez — preenche, reinicia, descobre a próxima —
// e são quatro rodadas para chegar ao mesmo lugar.
function conferirObrigatorias() {
  const faltando = [
    ["SQLSERVER_HOST", "DB_HOST"],
    ["SQLSERVER_DATABASE", "DB_NAME"],
    ["SQLSERVER_USER", "DB_USER"],
    ["SQLSERVER_PASSWORD", "DB_PASS"],
  ].filter((nomes) => ler(nomes) == null);

  if (!faltando.length) return;

  throw new Error(
    `Faltam variáveis de ambiente no .env: ${faltando.map(([nome]) => nome).join(", ")}. ` +
      `Copie .env.example para .env e preencha.`
  );
}

function configuracao() {
  conferirObrigatorias();

  return {
    server: obrigatorio(["SQLSERVER_HOST", "DB_HOST"]),
    database: obrigatorio(["SQLSERVER_DATABASE", "DB_NAME"]),
    user: obrigatorio(["SQLSERVER_USER", "DB_USER"]),
    password: obrigatorio(["SQLSERVER_PASSWORD", "DB_PASS"]),
    port: numero(["SQLSERVER_PORT", "DB_PORT"], 1433),
    options: {
      encrypt: booleano(["SQLSERVER_ENCRYPT", "DB_ENCRYPT"], true),
      // Instância on-premise sem certificado assinado por CA pública.
      trustServerCertificate: booleano(["SQLSERVER_TRUST_CERTIFICATE", "DB_TRUST_CERT"], true),
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: numero(["SQLSERVER_TIMEOUT", "DB_TIMEOUT"], 30000),
    requestTimeout: numero(["SQLSERVER_TIMEOUT", "DB_TIMEOUT"], 30000),
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
