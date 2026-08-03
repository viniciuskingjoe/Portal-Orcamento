// Define a senha de alguém direto no banco.
//
//   node --env-file=.env scripts/definir-senha.mjs <login> [--manter]
//
// Existe por dois motivos:
//
//   1. DESTRAVAR O PRIMEIRO ACESSO. Quem já estava cadastrado de quando o login
//      era por AD não tem senha no portal, e a tela de administração — que seria
//      onde criar uma — exige estar logado. Sem isto ninguém entra.
//   2. Recuperar o administrador que perdeu a própria senha. Não há "esqueci a
//      senha" no portal de propósito: quem confirma identidade é uma pessoa, não
//      um formulário.
//
// Aplica a SENHA PADRÃO da empresa e marca troca obrigatória. `--sortear` gera
// uma senha aleatória em vez da padrão, para quando a conta não deve ficar
// aberta a quem conhece a padrão — é o caso de um administrador.
//
// `--todos` aplica a todos que estão sem senha, que é o caso ao migrar do login
// por AD: ninguém tem senha, e é impossível entrar para criar a primeira.
//
// Roda no servidor, exige acesso ao banco. Não é rota, não é tela.

import { encerrar, query, queryOne } from "../server/sqlserver.js";
import { SENHA_PADRAO, gerarHash, sortearSenha } from "../server/senha.js";

const argumentos = process.argv.slice(2);
const opcoes = argumentos.filter((item) => item.startsWith("--"));
const [login] = argumentos.filter((item) => !item.startsWith("--"));
const manter = opcoes.includes("--manter");
const sortear = opcoes.includes("--sortear");
const todos = opcoes.includes("--todos");

if (!login && !todos) {
  console.error(`uso:
  node --env-file=.env scripts/definir-senha.mjs <login> [--sortear] [--manter]
  node --env-file=.env scripts/definir-senha.mjs --todos       (todos que estão sem senha)`);
  process.exit(1);
}

// --todos: quem está sem senha recebe a padrão. É o caminho da migração do
// login por AD, em que ninguém tem senha e ninguém consegue entrar para criar.
if (todos) {
  const sem = await query(
    "SELECT LOGIN, NOME FROM dbo.KING_IDENTIDADE_USUARIO WHERE SENHA_HASH IS NULL ORDER BY LOGIN"
  );

  if (!sem.length) {
    console.log("Ninguém está sem senha.");
  } else {
    // Um hash por pessoa, mesmo sendo a mesma senha: o sal é por senha, então
    // dois hashes iguais denunciariam quem ainda está com a padrão a quem
    // conseguisse ler a tabela.
    for (const usuario of sem) {
      await query(
        `UPDATE dbo.KING_IDENTIDADE_USUARIO
            SET SENHA_HASH = @hash, TROCAR_SENHA = 1, ATUALIZADO_EM = SYSUTCDATETIME()
          WHERE LOGIN = @login`,
        { login: usuario.LOGIN, hash: await gerarHash(SENHA_PADRAO) }
      );
      console.log(`  ${usuario.LOGIN.padEnd(24)} ${usuario.NOME}`);
    }
    console.log(`
  ${sem.length} ${sem.length === 1 ? "pessoa recebeu" : "pessoas receberam"} a senha padrão: ${SENHA_PADRAO}
  Todas terão que trocá-la no primeiro acesso.
`);
  }
  await encerrar();
  process.exit(0);
}

const alvo = login.trim().toLowerCase();

try {
  const usuario = await queryOne(
    "SELECT LOGIN, NOME, SENHA_HASH FROM dbo.KING_IDENTIDADE_USUARIO WHERE LOGIN = @login",
    { login: alvo }
  );

  if (!usuario) {
    console.error(`Login "${alvo}" não existe em KING_IDENTIDADE_USUARIO.`);
    const parecidos = await query(
      "SELECT TOP 5 LOGIN FROM dbo.KING_IDENTIDADE_USUARIO ORDER BY LOGIN",
      {}
    );
    if (parecidos.length) {
      console.error("Cadastrados: " + parecidos.map((linha) => linha.LOGIN).join(", "));
    }
    process.exit(1);
  }

  const senha = sortear ? sortearSenha() : SENHA_PADRAO;
  await query(
    `UPDATE dbo.KING_IDENTIDADE_USUARIO
        SET SENHA_HASH = @hash, TROCAR_SENHA = @trocar, ATUALIZADO_EM = SYSUTCDATETIME()
      WHERE LOGIN = @login`,
    { login: alvo, hash: await gerarHash(senha), trocar: manter ? 0 : 1 }
  );

  // Sessões abertas caem: se a senha mudou, as de antes não valem mais.
  await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @login", { login: alvo });

  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE)
     VALUES (@login, 'orcamento', 'senha-redefinida', 'scripts/definir-senha.mjs')`,
    { login: alvo }
  ).catch(() => {});

  console.log(`
  ${usuario.NOME} (${alvo})

      senha:  ${senha}

  ${manter ? "Sem troca obrigatória." : "Será pedida a troca no primeiro acesso."}${
    sortear
      ? "\n  Sorteada: não fica recuperável, o banco guarda só o hash. Perdida, rode de novo."
      : "\n  É a senha padrão da empresa — até a troca, quem a conhece entra nesta conta."
  }
`);
} finally {
  await encerrar();
}
