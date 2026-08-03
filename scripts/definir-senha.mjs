// Define a senha de alguém direto no banco.
//
//   node --env-file=.env scripts/definir-senha.mjs <login> [--manter]
//
// NÃO é o caminho normal. No dia a dia ninguém precisa disto: quem ainda não tem
// senha no portal entra com a da rede e define a dele na hora.
//
// Serve para quando o AD não está disponível — DC fora do ar, conta de rede
// desabilitada, alguém de fora que precisa entrar — e o portal precisaria ficar
// inacessível até o diretório voltar.
//
// Sorteia a senha e mostra uma vez; `--manter` dispensa a troca obrigatória.
//
// Roda no servidor, exige acesso ao banco. Não é rota, não é tela.

import { encerrar, query, queryOne } from "../server/sqlserver.js";
import { gerarHash, sortearSenha } from "../server/senha.js";

const argumentos = process.argv.slice(2);
const opcoes = argumentos.filter((item) => item.startsWith("--"));
const [login] = argumentos.filter((item) => !item.startsWith("--"));
const manter = opcoes.includes("--manter");


if (!login) {
  console.error("uso: node --env-file=.env scripts/definir-senha.mjs <login> [--manter]");
  process.exit(1);
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

  const senha = sortearSenha();
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

  ${manter ? "Sem troca obrigatória." : "Será pedida a troca no primeiro acesso."}
  Não fica recuperável: o banco guarda só o hash. Perdida, rode de novo.
`);
} finally {
  await encerrar();
}
