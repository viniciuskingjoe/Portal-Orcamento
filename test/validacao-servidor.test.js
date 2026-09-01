import test from "node:test";
import assert from "node:assert/strict";

import {
  exigirPlanoAtivo,
  indexarMapeamentos,
  validarAcessos,
  validarAlteracaoModulo,
  validarAlteracaoUsuario,
  validarCelulasDeFuncionarios,
  validarCelulasPlanejadas,
  validarLinhaDre,
  validarNovoUsuario,
  validarOrdemDre,
  validarPlano,
  validarVisao,
} from "../server/validacao.js";

const mapeamentos = indexarMapeamentos([
  { MODULO: "receita-vendas", COD_FILIAL: "F1", CENTRO_CUSTO: "C1", CLASSIFICACAO: "3.1" },
  { MODULO: "deducoes-vendas", COD_FILIAL: "F1", CENTRO_CUSTO: "C1", CLASSIFICACAO: "4.1" },
]);

test("plano é normalizado e limitado ao schema", () => {
  assert.deepEqual(validarPlano({ id: " p1 ", nome: " Oficial ", ano: "2027", visaoId: " v1 " }), {
    id: "p1",
    nome: "Oficial",
    ano: 2027,
    visaoId: "v1",
  });
  assert.throws(() => validarPlano({ id: "p", nome: "", ano: 2027 }), /nome/);
});

test("célula comum precisa existir na visão e aceita zero como exclusão", () => {
  assert.deepEqual(
    validarCelulasPlanejadas(
      [{ modulo: "receita-vendas", filial: "F1", centro: "C1", conta: "3.1", mes: 1, valor: 0 }],
      mapeamentos
    ),
    [{ modulo: "receita-vendas", filial: "F1", centro: "C1", conta: "3.1", receita: "", mes: 1, valor: 0 }]
  );

  assert.throws(
    () =>
      validarCelulasPlanejadas(
        [{ modulo: "receita-vendas", filial: "F1", centro: "C2", conta: "3.1", mes: 1, valor: 10 }],
        mapeamentos
      ),
    (erro) => erro.status === 409
  );
});

test("valor inválido é rejeitado em vez de apagar a célula", () => {
  assert.throws(
    () =>
      validarCelulasPlanejadas(
        [{ modulo: "receita-vendas", filial: "F1", centro: "C1", conta: "3.1", mes: 1, valor: null }],
        mapeamentos
      ),
    /número finito/
  );
});

test("módulo percentual exige receita válida da mesma filial e centro", () => {
  const celula = {
    modulo: "deducoes-vendas",
    filial: "F1",
    centro: "C1",
    conta: "4.1",
    receita: "3.1",
    mes: 2,
    valor: 5.25,
  };
  assert.deepEqual(validarCelulasPlanejadas([celula], mapeamentos), [celula]);
  assert.throws(
    () => validarCelulasPlanejadas([{ ...celula, receita: "3.9" }], mapeamentos),
    (erro) => erro.status === 409
  );
});

test("funcionários aceitam limpeza, mas rejeitam fração e centro fora da visão", () => {
  const centros = new Set(["F1|C1"]);
  assert.deepEqual(
    validarCelulasDeFuncionarios([{ filial: "F1", centro: "C1", mes: 1, quantidade: null }], centros),
    [{ filial: "F1", centro: "C1", mes: 1, quantidade: null }]
  );
  assert.throws(
    () => validarCelulasDeFuncionarios([{ filial: "F1", centro: "C1", mes: 1, quantidade: 1.5 }], centros),
    /inteiro/
  );
  assert.throws(
    () => validarCelulasDeFuncionarios([{ filial: "F1", centro: "C2", mes: 1, quantidade: 1 }], centros),
    (erro) => erro.status === 409
  );
});

test("plano inativo ou sem visão não aceita lançamentos", () => {
  assert.throws(() => exigirPlanoAtivo(null), (erro) => erro.status === 404);
  assert.throws(() => exigirPlanoAtivo({ VISAO_ID: "v1", SITUACAO: "inativo" }), /inativo/);
  assert.throws(() => exigirPlanoAtivo({ VISAO_ID: null, SITUACAO: "ativo" }), /visão/);
  assert.doesNotThrow(() => exigirPlanoAtivo({ VISAO_ID: "v1", SITUACAO: "ativo" }));
});

test("visão e alteração de módulo são normalizadas contra os catálogos do ERP", () => {
  assert.deepEqual(validarVisao({ id: " v1 ", nome: " Gerencial ", visaoContabil: " 25 " }), {
    id: "v1",
    nome: "Gerencial",
    visaoContabil: "25",
  });
  const mudanca = validarAlteracaoModulo(
    "receita-vendas",
    { filial: "F1", centro: "C1", usoDoCentro: true, contas: ["3.1", "3.1"] },
    {
      filiais: [{ id: "F1" }],
      centros: [{ id: "C1" }],
      contas: [{ codigo: "3.1", grupo: "R", sintetica: false }],
    }
  );
  assert.deepEqual(mudanca, {
    filial: "F1",
    centro: "C1",
    usoDoCentro: true,
    contas: ["3.1"],
  });
  assert.throws(
    () =>
      validarAlteracaoModulo(
        "receita-vendas",
        { filial: "F2", centro: "C1", contas: ["3.1"] },
        {
          filiais: [{ id: "F1" }],
          centros: [{ id: "C1" }],
          contas: [{ codigo: "3.1", grupo: "R", sintetica: false }],
        }
      ),
    (erro) => erro.status === 409
  );
});

test("DRE recusa referência inexistente, ciclo indireto e ordem malformada", () => {
  const linhas = [
    { id: "a", origem: "formula", formula: "L[b]" },
    { id: "b", origem: "formula", formula: "L[a]" },
  ];
  assert.throws(
    () =>
      validarLinhaDre(
        { id: "a", ordem: 0, titulo: "A", origem: "formula", formula: "L[b]" },
        { linhas }
      ),
    (erro) => erro.status === 409 && /circular/i.test(erro.message)
  );
  assert.throws(
    () =>
      validarLinhaDre(
        { id: "c", ordem: 0, titulo: "C", origem: "formula", formula: "L[inexistente]" },
        { linhas }
      ),
    /inexistente/
  );
  assert.deepEqual(validarOrdemDre([{ id: " a ", ordem: 2 }]), [{ id: "a", ordem: 2 }]);
  assert.throws(() => validarOrdemDre(undefined), /lista/);
});

test("permissão exige dimensões explícitas para não transformar corpo vazio em acesso global", () => {
  assert.throws(() => validarAcessos([{}]), /obrigatório/);
  assert.deepEqual(
    validarAcessos([{ modulo: null, filial: null, centro: null, podeEditar: false }]),
    [{ modulo: null, filial: null, centro: null, podeEditar: false }]
  );
  assert.throws(
    () => validarAcessos([{ modulo: null, filial: null, centro: null, podeEditar: "sim" }]),
    /verdadeiro ou falso/
  );
});

test("corpos de administração de usuário são estritos", () => {
  assert.deepEqual(validarNovoUsuario({ login: " joao ", nome: " João ", email: "j@x.local" }), {
    login: "joao",
    nome: "João",
    email: "j@x.local",
  });
  assert.deepEqual(validarAlteracaoUsuario({ admin: true, situacao: "ativo" }), {
    admin: true,
    situacao: "ativo",
  });
  assert.throws(() => validarAlteracaoUsuario({}), /Envie/);
  assert.throws(() => validarAlteracaoUsuario({ admin: 1 }), /verdadeiro ou falso/);
});
