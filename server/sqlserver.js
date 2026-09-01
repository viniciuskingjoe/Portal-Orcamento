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

function abrirPool() {
  const conexao = new sql.ConnectionPool(configuracao());

  // Conexão que morre DEPOIS de aberta (rede oscilou, VPN reconectou, o SQL
  // Server reiniciou) não derruba o pool: ele continua em cache, e toda
  // requisição seguinte fica pendurada até estourar o requestTimeout — 30s para
  // devolver erro, indefinidamente, até alguém reiniciar o serviço.
  //
  // Descartar o cache aqui faz a próxima requisição abrir um pool novo, e o
  // portal se recupera sozinho.
  conexao.on("error", () => {
    if (poolPromise === promessa) poolPromise = null;
  });

  const promessa = conexao
    .connect()
    .then(() => conexao)
    .catch((erro) => {
      // Sem isto uma falha na primeira conexão ficaria em cache para sempre e
      // toda requisição seguinte rejeitaria com o erro antigo.
      if (poolPromise === promessa) poolPromise = null;
      throw erro;
    });

  return promessa;
}

export async function pool() {
  if (!poolPromise) poolPromise = abrirPool();
  const conexao = await poolPromise;

  // O evento `error` cobre a queda avisada; esta conferência cobre a silenciosa.
  // Uma tentativa só: se o pool novo também vier desconectado, o erro é outro e
  // insistir viraria laço.
  if (conexao.connected) return conexao;

  poolPromise = abrirPool();
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
    // Uma transação do `mssql` ocupa uma única conexão. Alguns consumidores
    // montam leituras independentes com Promise.all; dispará-las fisicamente ao
    // mesmo tempo nessa conexão causa "request in progress" em vez de ganho de
    // paralelismo. A fila preserva a API assíncrona e executa na ordem dentro
    // da transação; consultas fora dela continuam paralelas pelo pool.
    let fila = Promise.resolve();
    const consultaTransacional = (texto, parametros = {}) => {
      const rodar = async () => {
        const request = new sql.Request(transacao);
        aplicarParametros(request, parametros);
        const saida = await request.query(texto);
        return saida.recordset ?? [];
      };
      const resultado = fila.then(rodar);
      fila = resultado.then(
        () => undefined,
        () => undefined
      );
      return resultado;
    };
    const resultado = await executar({
      query: consultaTransacional,
    });
    await transacao.commit();
    return resultado;
  } catch (erro) {
    try {
      await transacao.rollback();
    } catch (erroDoRollback) {
      // Rollback quebrado é diagnóstico adicional; nunca deve esconder a causa
      // que fez a operação financeira falhar em primeiro lugar.
      erro.cause ??= erroDoRollback;
      console.error("[sql] rollback falhou:", erroDoRollback);
    }
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
