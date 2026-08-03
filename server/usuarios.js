import { query, transaction } from "./sqlserver.js";
import { normalizarLogin } from "./ldap.js";

// ============================================================================
// ADMINISTRAÇÃO DE USUÁRIOS
//
// O cadastro é compartilhado entre os portais (KING_IDENTIDADE_*), mas o que se
// administra aqui é só o acesso a ESTE portal. Desativar alguém no Orçamento não
// mexe no Fluxo Fiscal nem no Modelagem.
//
// Nenhuma rota daqui cria senha: quem autentica é o AD.
// ============================================================================

const APP = "orcamento";

export async function listarUsuarios() {
  const [usuarios, acessos] = await Promise.all([
    query(
      `SELECT u.LOGIN, u.NOME, u.EMAIL, u.SITUACAO, u.ULTIMO_LOGIN,
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
// existir no cadastro por causa de outro portal — nesse caso só ganha o acesso.
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

  return alvo;
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

export async function concederAcesso(login, { modulo, filial, centro, podeEditar }, quem) {
  const vazio = (valor) => (valor === "" || valor === undefined ? null : valor);

  await query(
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
