import {
  MODULO_BASE_DO_PERCENTUAL,
  MODULO_OPERACIONAIS,
  MODULO_PESSOAL,
  ehModulo,
  ehPercentual,
  modulo as definicaoDoModulo,
} from "../src/dados/modulos.js";
import { referenciasDaFormula, validarFormula } from "../src/dados/formula.js";

const SEM_CENTRO = "";
const LIMITE_DE_CELULAS = 500;
const MAIOR_DECIMAL_18_6 = 999_999_999_999.999999;
const MAIOR_INT = 2_147_483_647;
const LIMITE_DE_ACESSOS = 500;
const LIMITE_DE_LOTES = 200;
const LIMITE_DE_MAPEAMENTOS = 2000;

function falha(mensagem, status = 400) {
  const erro = new Error(mensagem);
  erro.status = status;
  throw erro;
}

function texto(valor, campo, maximo, { vazio = false } = {}) {
  const normalizado = typeof valor === "string" ? valor.trim() : "";
  if (!vazio && !normalizado) falha(`Campo \`${campo}\` é obrigatório.`);
  if (normalizado.length > maximo) falha(`Campo \`${campo}\` excede ${maximo} caracteres.`);
  return normalizado;
}

function objeto(valor, campo) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    falha(`Campo \`${campo}\` precisa ser um objeto.`);
  }
  return valor;
}

function lista(valor, campo, limite = LIMITE_DE_CELULAS) {
  if (!Array.isArray(valor)) falha(`Campo \`${campo}\` precisa ser uma lista.`);
  if (valor.length > limite) falha(`Campo \`${campo}\` aceita no máximo ${limite} itens.`, 413);
  return valor;
}

function booleano(valor, campo) {
  if (typeof valor !== "boolean") falha(`Campo \`${campo}\` precisa ser verdadeiro ou falso.`);
  return valor;
}

function opcional(valor, campo, maximo) {
  if (valor === null) return null;
  return texto(valor, campo, maximo);
}

function catalogoPorId(itens) {
  return new Map((itens ?? []).map((item) => [String(item.id ?? item.codigo), item]));
}

function validarContaDoModulo(codigo, moduloId, contas, campo = "conta") {
  const normalizada = texto(codigo, campo, 30);
  const conta = catalogoPorId(contas).get(normalizada);
  if (!conta) falha(`Conta ${normalizada} não existe na visão contábil escolhida.`, 409);
  if (conta.sintetica === true || conta.sintetica === 1) {
    falha(`Conta ${normalizada} é sintética e não aceita lançamento.`, 409);
  }
  const modulo = definicaoDoModulo(moduloId);
  if (modulo?.grupo && conta.grupo !== modulo.grupo) {
    falha(`Conta ${normalizada} não pertence ao grupo contábil do módulo ${modulo.titulo}.`, 409);
  }
  if (modulo?.prefixos?.length && !modulo.prefixos.some((prefixo) => normalizada.startsWith(prefixo))) {
    falha(`Conta ${normalizada} não pertence às famílias aceitas por ${modulo.titulo}.`, 409);
  }
  return normalizada;
}

export function validarVisao(visao) {
  return {
    id: texto(visao?.id, "id", 40),
    nome: texto(visao?.nome, "nome", 80),
    visaoContabil: texto(visao?.visaoContabil, "visaoContabil", 10),
  };
}

export function validarFiliaisAtivas(valor, filiais = []) {
  const conhecidas = catalogoPorId(filiais);
  return [...new Set(lista(valor, "valor").map((id, indice) => {
    const filial = texto(id, `valor[${indice}]`, 10);
    if (conhecidas.size && !conhecidas.has(filial)) falha(`Filial ${filial} não existe no ERP.`, 409);
    return filial;
  }))];
}

export function validarGrupo(grupo, centros = []) {
  objeto(grupo, "grupo");
  const conhecidos = catalogoPorId(centros);
  const selecionados = [...new Set(lista(grupo.centros, "centros").map((id, indice) => {
    const centro = texto(id, `centros[${indice}]`, 10);
    if (conhecidos.size && !conhecidos.has(centro)) falha(`Centro ${centro} não existe no ERP.`, 409);
    return centro;
  }))];
  return {
    id: texto(grupo.id, "id", 40),
    nome: texto(grupo.nome, "nome", 80),
    centros: selecionados,
  };
}

export function validarAlteracaoModulo(moduloId, mudanca, catalogos = {}) {
  if (!ehModulo(moduloId)) falha("Módulo desconhecido.");
  objeto(mudanca, "corpo");
  const reconhecidas = ["lotes", "usoDoCentro", "contas", "sinal", "formula"].filter(
    (campo) => Object.hasOwn(mudanca, campo)
  );
  if (!reconhecidas.length) falha("Envie ao menos uma alteração de módulo.");

  const filiais = catalogoPorId(catalogos.filiais);
  const centros = catalogoPorId(catalogos.centros);
  const validarLugar = (alvo, prefixo = "") => {
    const filial = texto(alvo?.filial, `${prefixo}filial`, 10);
    const centro = texto(alvo?.centro ?? SEM_CENTRO, `${prefixo}centro`, 10, { vazio: true });
    if (filiais.size && !filiais.has(filial)) falha(`Filial ${filial} não existe no ERP.`, 409);
    if (centro && centros.size && !centros.has(centro)) falha(`Centro ${centro} não existe no ERP.`, 409);
    return { filial, centro };
  };
  const validarContas = (valores, campo) =>
    [...new Set(lista(valores, campo).map((conta) => validarContaDoModulo(conta, moduloId, catalogos.contas, campo)))];

  const saida = {};
  if (Object.hasOwn(mudanca, "lotes")) {
    saida.lotes = lista(mudanca.lotes, "lotes", LIMITE_DE_LOTES).map((lote, indice) => {
      objeto(lote, `lotes[${indice}]`);
      return {
        ...validarLugar(lote, `lotes[${indice}].`),
        contas: validarContas(lote.contas, `lotes[${indice}].contas`),
      };
    });
  }
  if (Object.hasOwn(mudanca, "usoDoCentro")) {
    Object.assign(saida, validarLugar(mudanca));
    saida.usoDoCentro = booleano(mudanca.usoDoCentro, "usoDoCentro");
  }
  if (Object.hasOwn(mudanca, "contas")) {
    Object.assign(saida, validarLugar(mudanca));
    saida.contas = validarContas(mudanca.contas, "contas");
  }
  if (Object.hasOwn(mudanca, "sinal")) {
    const sinal = objeto(mudanca.sinal, "sinal");
    const conta = validarContaDoModulo(sinal.conta, moduloId, catalogos.contas, "sinal.conta");
    if (![null, "receita", "despesa"].includes(sinal.tipo)) {
      falha("Campo `sinal.tipo` precisa ser receita, despesa ou null.");
    }
    saida.sinal = { conta, tipo: sinal.tipo };
  }
  if (Object.hasOwn(mudanca, "formula")) {
    const formula = objeto(mudanca.formula, "formula");
    const conta = validarContaDoModulo(formula.conta, moduloId, catalogos.contas, "formula.conta");
    const expressao = formula.expressao == null ? null : String(formula.expressao).trim();
    if (expressao?.length > 500) falha("Campo `formula.expressao` excede 500 caracteres.");
    if (expressao) {
      const critica = validarFormula(expressao);
      if (critica) falha(`Fórmula inválida: ${critica}`);
      for (const referencia of referenciasDaFormula(expressao)) {
        if (referencia.prefixo !== "V") falha("Fórmula de conta aceita apenas referências V[].");
        if (referencia.codigo === "funcionarios") continue;
        validarContaDoModulo(referencia.codigo, moduloId, catalogos.contas, "formula.referencia");
      }
    }
    saida.formula = { conta, expressao };
  }
  return saida;
}

export function validarMapeamentos(mapeamentos, catalogos = {}) {
  const validados = lista(mapeamentos, "mapeamentos", LIMITE_DE_MAPEAMENTOS).map(
    (item, indice) => {
      objeto(item, `mapeamentos[${indice}]`);
      const modulo = texto(item.modulo, `mapeamentos[${indice}].modulo`, 40);
      const mudanca = validarAlteracaoModulo(
        modulo,
        { filial: item.filial, centro: item.centro, contas: item.contas },
        catalogos
      );
      return { modulo, filial: mudanca.filial, centro: mudanca.centro, contas: mudanca.contas };
    }
  );

  const chaves = new Set();
  for (const item of validados) {
    const chave = `${item.modulo}|${item.filial}|${item.centro}`;
    if (chaves.has(chave)) falha(`Mapeamento duplicado para ${chave}.`);
    chaves.add(chave);
  }
  validarExclusividadeDeMapeamentos(validados);
  return validados;
}

export function validarExclusividadeDeMapeamentos(mapeamentos) {
  const ocupadas = new Map();
  for (const item of mapeamentos ?? []) {
    if (item.modulo !== MODULO_PESSOAL && item.modulo !== MODULO_OPERACIONAIS) continue;
    for (const conta of item.contas ?? []) {
      const chave = `${item.filial}|${item.centro ?? SEM_CENTRO}|${conta}`;
      const anterior = ocupadas.get(chave);
      if (anterior && anterior !== item.modulo) {
        falha(`A conta ${conta} não pode ficar em Pessoal e Operacionais no mesmo centro.`, 409);
      }
      ocupadas.set(chave, item.modulo);
    }
  }
  return mapeamentos;
}

export function validarLinhaDre(linha, { contas = [], linhas = [] } = {}) {
  objeto(linha, "linha");
  const origem = linha.origem;
  if (!["modulo", "formula"].includes(origem)) falha("Origem da linha do DRE inválida.");
  const ordem = Number(linha.ordem ?? 0);
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 10000) falha("Ordem da linha do DRE inválida.");

  const normalizada = {
    id: texto(linha.id, "id", 40),
    ordem,
    titulo: texto(linha.titulo, "titulo", 120),
    origem,
    moduloId: null,
    sinal: null,
    formula: null,
    valores: [],
    mostra: linha.mostra !== false,
    destaca: linha.destaca === true,
    baseAnaliseVertical: linha.baseAnaliseVertical === true,
    linhaPrincipal: linha.linhaPrincipal === true,
    unidade: linha.unidade === "percentual" ? "percentual" : "moeda",
  };

  if (origem === "modulo") {
    if (!ehModulo(linha.moduloId)) falha("Módulo da linha do DRE inválido.");
    if (![null, 1, -1].includes(linha.sinal ?? null)) falha("Sinal da linha do DRE inválido.");
    normalizada.moduloId = linha.moduloId;
    normalizada.sinal = linha.sinal ?? null;
    normalizada.valores = lista(linha.valores ?? [], "valores").map((item, indice) => {
      objeto(item, `valores[${indice}]`);
      const codigo = texto(item.codigo, `valores[${indice}].codigo`, 30);
      if (contas.length && !catalogoPorId(contas).has(codigo)) {
        falha(`Conta ${codigo} da linha do DRE não existe na visão contábil.`, 409);
      }
      return { codigo, sinal: item.sinal === -1 ? -1 : 1 };
    });
  } else {
    const expressao = texto(linha.formula, "formula", 500);
    const critica = validarFormula(expressao);
    if (critica) falha(`Fórmula do DRE inválida: ${critica}`);
    const ids = new Set(linhas.map((item) => item.id));
    for (const referencia of referenciasDaFormula(expressao)) {
      if (referencia.prefixo === "L" && referencia.codigo === normalizada.id) {
        falha("A fórmula da linha não pode depender dela mesma.", 409);
      }
      if (referencia.prefixo === "L" && !ids.has(referencia.codigo)) {
        falha(`A fórmula referencia a linha inexistente ${referencia.codigo}.`, 409);
      }
      if (referencia.prefixo === "V" && contas.length && !catalogoPorId(contas).has(referencia.codigo)) {
        falha(`A fórmula referencia a conta inexistente ${referencia.codigo}.`, 409);
      }
    }
    normalizada.formula = expressao;

    // Validar só a autorreferência direta deixa passar A -> B -> A. Montamos o
    // grafo com a versão que está sendo salva e recusamos qualquer ciclo antes
    // que ele chegue ao banco e transforme o DRE inteiro em zero.
    const formulas = new Map(
      linhas
        .filter((item) => item.origem === "formula" && item.id !== normalizada.id)
        .map((item) => [item.id, item.formula])
    );
    formulas.set(normalizada.id, expressao);
    const visitando = new Set();
    const visitadas = new Set();
    const visitar = (id) => {
      if (visitando.has(id)) falha(`A fórmula cria uma dependência circular envolvendo ${id}.`, 409);
      if (visitadas.has(id) || !formulas.has(id)) return;
      visitando.add(id);
      for (const referencia of referenciasDaFormula(formulas.get(id))) {
        if (referencia.prefixo === "L") visitar(referencia.codigo);
      }
      visitando.delete(id);
      visitadas.add(id);
    };
    visitar(normalizada.id);
  }
  return normalizada;
}

export function validarOrdemDre(ordem) {
  return lista(ordem, "ordem").map((item, indice) => {
    objeto(item, `ordem[${indice}]`);
    const valor = Number(item.ordem);
    if (!Number.isInteger(valor) || valor < 0 || valor > 10000) falha(`ordem[${indice}].ordem inválida.`);
    return { id: texto(item.id, `ordem[${indice}].id`, 40), ordem: valor };
  });
}

export function validarAcessos(acessos) {
  return lista(acessos, "acessos", LIMITE_DE_ACESSOS).map((acesso, indice) => {
    objeto(acesso, `acessos[${indice}]`);
    for (const campo of ["modulo", "filial", "centro", "podeEditar"]) {
      if (!Object.hasOwn(acesso, campo)) falha(`acessos[${indice}].${campo} é obrigatório, mesmo quando null.`);
    }
    const modulo = opcional(acesso.modulo, `acessos[${indice}].modulo`, 40);
    if (modulo && !ehModulo(modulo)) falha(`acessos[${indice}].modulo é desconhecido.`);
    return {
      modulo,
      filial: opcional(acesso.filial, `acessos[${indice}].filial`, 10),
      centro: opcional(acesso.centro, `acessos[${indice}].centro`, 10),
      podeEditar: booleano(acesso.podeEditar, `acessos[${indice}].podeEditar`),
    };
  });
}

export function validarNovoUsuario(usuario) {
  objeto(usuario, "corpo");
  const email = usuario.email == null ? null : texto(usuario.email, "email", 254, { vazio: true });
  if (email && !email.includes("@")) falha("Campo `email` é inválido.");
  return {
    login: texto(usuario.login, "login", 120),
    nome: texto(usuario.nome ?? usuario.login, "nome", 160),
    email,
  };
}

export function validarAlteracaoUsuario(mudanca) {
  objeto(mudanca, "corpo");
  const saida = {};
  if (Object.hasOwn(mudanca, "admin")) saida.admin = booleano(mudanca.admin, "admin");
  if (Object.hasOwn(mudanca, "situacao")) {
    if (!["ativo", "inativo"].includes(mudanca.situacao)) {
      falha("Campo `situacao` precisa ser ativo ou inativo.");
    }
    saida.situacao = mudanca.situacao;
  }
  if (!Object.keys(saida).length) falha("Envie `admin` e/ou `situacao` para alterar o usuário.");
  return saida;
}

function validarLote(celulas) {
  if (!Array.isArray(celulas)) falha("Envie `celulas` como uma lista.");
  if (celulas.length > LIMITE_DE_CELULAS) {
    falha(`Envie no máximo ${LIMITE_DE_CELULAS} células por operação.`, 413);
  }
}

function chaveDeMapeamento(modulo, filial, centro, conta) {
  return `${modulo}|${filial}|${centro ?? SEM_CENTRO}|${conta}`;
}

export function indexarMapeamentos(linhas) {
  return new Set(
    (linhas ?? []).map((linha) =>
      chaveDeMapeamento(
        linha.MODULO ?? linha.modulo,
        linha.COD_FILIAL ?? linha.filial,
        linha.CENTRO_CUSTO ?? linha.centro,
        linha.CLASSIFICACAO ?? linha.classificacao
      )
    )
  );
}

export function validarPlano(plano) {
  const ano = Number(plano?.ano);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    falha("Informe um ano entre 2000 e 2100.");
  }

  const visaoId = plano?.visaoId == null ? null : texto(plano.visaoId, "visaoId", 40);
  return {
    id: texto(plano?.id, "id", 40),
    nome: texto(plano?.nome, "nome", 80),
    ano,
    visaoId,
  };
}

export function validarCelulasPlanejadas(celulas, mapeamentos) {
  validarLote(celulas);

  return celulas.map((celula, indice) => {
    const prefixo = `Célula ${indice + 1}`;
    const modulo = texto(celula?.modulo, "modulo", 40);
    const filial = texto(celula?.filial, "filial", 10);
    const centro = texto(celula?.centro ?? SEM_CENTRO, "centro", 10, { vazio: true });
    const conta = texto(celula?.conta, "conta", 30);
    const receita = texto(celula?.receita ?? SEM_CENTRO, "receita", 30, { vazio: true });
    const mes = Number(celula?.mes);
    const valor = celula?.valor;

    if (!ehModulo(modulo)) falha(`${prefixo}: módulo desconhecido.`);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) falha(`${prefixo}: mês inválido.`);
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
      falha(`${prefixo}: valor precisa ser um número finito.`);
    }
    if (Math.abs(valor) > MAIOR_DECIMAL_18_6) falha(`${prefixo}: valor fora do limite aceito.`);

    if (!mapeamentos.has(chaveDeMapeamento(modulo, filial, centro, conta))) {
      falha(`${prefixo}: conta, filial ou centro não pertence à visão deste plano.`, 409);
    }

    if (ehPercentual(modulo)) {
      if (!receita) falha(`${prefixo}: informe a conta de receita usada como base.`);
      if (!mapeamentos.has(chaveDeMapeamento(MODULO_BASE_DO_PERCENTUAL, filial, centro, receita))) {
        falha(`${prefixo}: a receita usada como base não pertence à visão deste plano.`, 409);
      }
    } else if (receita) {
      falha(`${prefixo}: este módulo não aceita uma conta de receita como dimensão.`);
    }

    return { modulo, filial, centro, conta, receita, mes, valor };
  });
}

export function validarCelulasDeFuncionarios(celulas, centrosPermitidos) {
  validarLote(celulas);

  return celulas.map((celula, indice) => {
    const prefixo = `Célula ${indice + 1}`;
    const filial = texto(celula?.filial, "filial", 10);
    const centro = texto(celula?.centro ?? SEM_CENTRO, "centro", 10, { vazio: true });
    const mes = Number(celula?.mes);
    const quantidade = celula?.quantidade;

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) falha(`${prefixo}: mês inválido.`);
    if (quantidade != null && (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > MAIOR_INT)) {
      falha(`${prefixo}: quantidade precisa ser um inteiro não negativo.`);
    }
    if (!centrosPermitidos.has(`${filial}|${centro}`)) {
      falha(`${prefixo}: filial ou centro não pertence à visão deste plano.`, 409);
    }

    return { filial, centro, mes, quantidade };
  });
}

export function exigirPlanoAtivo(plano) {
  if (!plano) falha("Plano não encontrado.", 404);
  if ((plano.SITUACAO ?? plano.situacao ?? "ativo") !== "ativo") {
    falha("Este plano está inativo e não aceita novos lançamentos.", 409);
  }
  if (!(plano.VISAO_ID ?? plano.visaoId)) {
    falha("Este plano não tem uma visão associada.", 409);
  }
}
