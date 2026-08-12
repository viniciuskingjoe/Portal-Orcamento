import { query, transaction } from "./sqlserver.js";
import { normalizarLogin } from "./ldap.js";

// ============================================================================
// ADMINISTRAÇÃO DE USUÁRIOS
//
// O cadastro é compartilhado entre os portais (KING_IDENTIDADE_*), mas o que se
// administra aqui é só o acesso a ESTE portal. Desativar alguém no Orçamento não
// mexe no Fluxo Fiscal nem no Modelagem.
//
// Quem nunca definiu senha no portal entra com a do Windows e define a dele na
// hora — então cadastrar alguém aqui não cria nem entrega senha nenhuma.
// ============================================================================

const APP = "orcamento";

export async function listarUsuarios() {
  const [usuarios, acessos] = await Promise.all([
    query(
      `SELECT u.LOGIN, u.NOME, u.EMAIL, u.SITUACAO, u.ULTIMO_LOGIN,
              CASE WHEN u.SENHA_HASH IS NULL THEN 1 ELSE 0 END AS SEM_SENHA,
              a.ADMIN, a.SITUACAO AS SITUACAO_APP
         FROM dbo.KING_IDENTIDADE_USUARIO AS u
         INNER JOIN dbo.KING_IDENTIDADE_ACESSO AS a
                 ON a.LOGIN = u.LOGIN AND a.APP = @app
        ORDER BY u.NOME`,
      { app: APP }
    ),
    query(
      `SELECT ID, LOGIN, MODULO, COD_FILIAL, CENTRO_CUSTO, PODE_EDITAR
         FROM dbo.KING_PORTAL_ORC_ACESSO ORDER BY ID`
    ),
  ]);

  return usuarios.map((linha) => ({
    login: linha.LOGIN,
    nome: linha.NOME,
    email: linha.EMAIL,
    situacao: linha.SITUACAO_APP,
    inativoNoCadastro: linha.SITUACAO !== "ativo",
    admin: linha.ADMIN === true,
    ultimoLogin: linha.ULTIMO_LOGIN,
    // Ainda entra pela senha do Windows: nunca definiu a do portal.
    semSenhaDoPortal: linha.SEM_SENHA === 1 || linha.SEM_SENHA === true,
    acessos: acessos
      .filter((acesso) => acesso.LOGIN === linha.LOGIN)
      .map((acesso) => ({
        id: acesso.ID,
        modulo: acesso.MODULO,
        filial: acesso.COD_FILIAL,
        centro: acesso.CENTRO_CUSTO,
        podeEditar: acesso.PODE_EDITAR === true,
      })),
  }));
}

// Cria o vínculo com o portal a partir do que veio do AD. O usuário pode já
// existir no cadastro por causa de outro portal — nesse caso só ganha o acesso,
// e mantém a senha que já tinha.
//
// NÃO cria senha. Quem entra sem ter senha no portal entra com a do Windows e
// define a dele na hora — então não há senha inicial para inventar, entregar
// nem cobrar de volta.
export async function darAcesso({ login, nome, email }, quem) {
  const alvo = normalizarLogin(login);
  if (!alvo) {
    const erro = new Error("Login inválido.");
    erro.status = 400;
    throw erro;
  }

  await transaction(async ({ query: q }) => {
    await q(
      `MERGE dbo.KING_IDENTIDADE_USUARIO AS destino
       USING (SELECT @login AS LOGIN) AS origem ON destino.LOGIN = origem.LOGIN
       WHEN MATCHED THEN UPDATE SET NOME = @nome, EMAIL = @email, ATUALIZADO_EM = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (LOGIN, NOME, EMAIL, ORIGEM) VALUES (@login, @nome, @email, 'ad');`,
      { login: alvo, nome: nome ?? alvo, email: email ?? null }
    );

    await q(
      `IF NOT EXISTS (SELECT 1 FROM dbo.KING_IDENTIDADE_ACESSO WHERE LOGIN = @login AND APP = @app)
         INSERT INTO dbo.KING_IDENTIDADE_ACESSO (LOGIN, APP, CRIADO_POR)
         VALUES (@login, @app, @por)`,
      { login: alvo, app: APP, por: quem ?? null }
    );
  });

  return { login: alvo };
}

// Apaga a senha do portal. A pessoa volta a entrar pela senha do Windows e
// define outra na hora — nenhuma senha é inventada, escrita num bilhete ou dita
// por telefone, e não existe janela em que uma senha conhecida abre a conta.
//
// É o que fazer quando alguém esquece a senha ou quando se desconfia que ela
// vazou.
export async function limparSenha(login, quem) {
  await query(
    `UPDATE dbo.KING_IDENTIDADE_USUARIO
        SET SENHA_HASH = NULL, TROCAR_SENHA = 0, ATUALIZADO_EM = SYSUTCDATETIME()
      WHERE LOGIN = @login`,
    { login }
  );

  // Sessões abertas caem: se a senha foi apagada por suspeita, deixar a sessão
  // de pé até expirar não resolve nada.
  await query("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @login", { login });

  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE)
     VALUES (@login, @app, 'senha-redefinida', @detalhe)`,
    { login, app: APP, detalhe: `apagada por ${quem ?? "?"}` }
  ).catch(() => {});
}

export async function alterarUsuario(login, { admin, situacao }, quem) {
  if (admin !== undefined || situacao !== undefined) {
    await query(
      `UPDATE dbo.KING_IDENTIDADE_ACESSO
          SET ADMIN = COALESCE(@admin, ADMIN), SITUACAO = COALESCE(@situacao, SITUACAO)
        WHERE LOGIN = @login AND APP = @app`,
      {
        login,
        app: APP,
        admin: admin === undefined ? null : admin === true,
        situacao: situacao ?? null,
      }
    );
  }

  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE)
     VALUES (@login, @app, 'acesso-alterado', @detalhe)`,
    {
      login,
      app: APP,
      detalhe: `por ${quem ?? "?"}: ${JSON.stringify({ admin, situacao })}`.slice(0, 400),
    }
  ).catch(() => {});
}

// Tira do portal, mas não do cadastro: a pessoa pode usar outro portal.
export async function removerAcesso(login, quem) {
  await transaction(async ({ query: q }) => {
    await q("DELETE FROM dbo.KING_PORTAL_ORC_ACESSO WHERE LOGIN = @login", { login });
    await q("DELETE FROM dbo.KING_IDENTIDADE_ACESSO WHERE LOGIN = @login AND APP = @app", {
      login,
      app: APP,
    });
    // Sessão aberta cai junto: revogar acesso que continua valendo até expirar
    // não é revogar.
    await q("DELETE FROM dbo.KING_IDENTIDADE_SESSAO WHERE LOGIN = @login AND APP = @app", {
      login,
      app: APP,
    });
  });

  await query(
    `INSERT INTO dbo.KING_IDENTIDADE_AUDITORIA (LOGIN, APP, EVENTO, DETALHE)
     VALUES (@login, @app, 'acesso-alterado', @detalhe)`,
    { login, app: APP, detalhe: `removido por ${quem ?? "?"}` }
  ).catch(() => {});
}

// --------------------------------------------------------------------------
// Permissões do portal
//
// `null` em qualquer dimensão vale por "todas". A linha existir dá o direito de
// ver; `podeEditar` diz se também lança.
// --------------------------------------------------------------------------

// Lote em transação: marcar cinco centros e gravar três é pior que não gravar
// nada — a pessoa sai achando que concedeu os cinco.
export async function concederAcessos(login, lista, quem) {
  await transaction(async ({ query: q }) => {
    for (const acesso of lista ?? []) {
      await gravarConcessao(q, login, acesso, quem);
    }
  });
}

export async function concederAcesso(login, acesso, quem) {
  await concederAcessos(login, [acesso], quem);
}

// Troca o conjunto inteiro: o que não vier na lista deixa de valer.
//
// É o que o editor de território precisa. `concederAcessos` só acrescenta, e
// com ele desmarcar um módulo na matriz não tiraria nada — a permissão só
// cresceria, que é exatamente o defeito do modelo antigo.
//
// Numa transação só: entre apagar e reinserir, a pessoa ficaria sem acesso
// nenhum, e uma falha no meio a deixaria assim.
export async function definirAcessos(login, lista, quem) {
  await transaction(async ({ query: q }) => {
    await q("DELETE FROM dbo.KING_PORTAL_ORC_ACESSO WHERE LOGIN = @login", { login });
    for (const acesso of lista ?? []) {
      await gravarConcessao(q, login, acesso, quem);
    }
  });
}

function gravarConcessao(executar, login, { modulo, filial, centro, podeEditar }, quem) {
  const vazio = (valor) => (valor === "" || valor === undefined ? null : valor);

  return executar(
    `IF NOT EXISTS (
       SELECT 1 FROM dbo.KING_PORTAL_ORC_ACESSO
        WHERE LOGIN = @login
          AND ISNULL(MODULO, '~') = ISNULL(@modulo, '~')
          AND ISNULL(COD_FILIAL, '~') = ISNULL(@filial, '~')
          AND ISNULL(CENTRO_CUSTO, '~') = ISNULL(@centro, '~'))
       INSERT INTO dbo.KING_PORTAL_ORC_ACESSO
         (LOGIN, MODULO, COD_FILIAL, CENTRO_CUSTO, PODE_EDITAR, CRIADO_POR)
       VALUES (@login, @modulo, @filial, @centro, @editar, @por)
     ELSE
       UPDATE dbo.KING_PORTAL_ORC_ACESSO SET PODE_EDITAR = @editar
        WHERE LOGIN = @login
          AND ISNULL(MODULO, '~') = ISNULL(@modulo, '~')
          AND ISNULL(COD_FILIAL, '~') = ISNULL(@filial, '~')
          AND ISNULL(CENTRO_CUSTO, '~') = ISNULL(@centro, '~')`,
    {
      login,
      modulo: vazio(modulo),
      filial: vazio(filial),
      centro: vazio(centro),
      editar: podeEditar === true,
      por: quem ?? null,
    }
  );
}

export async function revogarAcesso(login, id) {
  await query("DELETE FROM dbo.KING_PORTAL_ORC_ACESSO WHERE ID = @id AND LOGIN = @login", {
    id: Number(id),
    login,
  });
}
