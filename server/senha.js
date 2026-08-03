import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// ============================================================================
// SENHA DO PORTAL
//
// O portal passou a ter senha propria, separada da senha de rede. O AD continua
// sendo consultado para descobrir QUEM cadastrar, mas nao valida mais ninguem.
//
// Guardar senha e uma responsabilidade que o bind no AD nao tinha. As regras
// abaixo existem para que ela seja carregada direito:
//
//   - scrypt, que e deliberadamente lento e faz forca bruta custar caro. Vem do
//     `node:crypto`, sem dependencia nova, e e o mesmo do Portal-Envio-Documentos.
//   - Sal aleatorio por senha, entao duas pessoas com a mesma senha nao tem o
//     mesmo hash e um vazamento nao se resolve com tabela pronta.
//   - Comparacao em tempo constante: comparar com `===` vaza, pelo tempo de
//     resposta, quantos bytes iniciais bateram.
//   - O formato guarda a versao e os parametros. Quando o custo precisar subir,
//     os hashes antigos continuam validos e migram no proximo login.
// ============================================================================

const scryptAsync = promisify(scrypt);

// N=2^15 leva ~100ms por verificacao nesta maquina. Custo alto o bastante para
// forca bruta doer e baixo o bastante para o login nao parecer travado.
const PARAMETROS = { N: 32768, r: 8, p: 1, tamanho: 64, sal: 16 };
const VERSAO = "s1";

export const TAMANHO_MINIMO = 10;

async function derivar(senha, sal, { N, r, p, tamanho }) {
  // `maxmem` precisa acompanhar o N: o padrao do Node (32MB) estoura com 2^15.
  return scryptAsync(senha.normalize("NFKC"), sal, tamanho, { N, r, p, maxmem: 256 * 1024 * 1024 });
}

export async function gerarHash(senha) {
  const sal = randomBytes(PARAMETROS.sal);
  const derivada = await derivar(senha, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return [VERSAO, N, r, p, sal.toString("hex"), derivada.toString("hex")].join(":");
}

export async function conferir(senha, guardado) {
  if (!senha || !guardado) return false;

  const partes = guardado.split(":");
  if (partes.length !== 6 || partes[0] !== VERSAO) return false;

  const [, N, r, p, salHex, hashHex] = partes;
  let esperado;
  try {
    esperado = Buffer.from(hashHex, "hex");
    const derivada = await derivar(senha, Buffer.from(salHex, "hex"), {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      tamanho: esperado.length,
    });
    // `timingSafeEqual` exige o mesmo tamanho, senao lanca.
    return derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Forca
//
// Comprimento e o que realmente importa; exigir maiuscula, numero e simbolo so
// produz "Senha@123" e obriga a anotar num papel. Aqui: tamanho minimo, e barrar
// o que e obvio demais para quem estiver tentando adivinhar.
// --------------------------------------------------------------------------

// Palavra que, sozinha ou com números no fim, é a senha inteira: "senha",
// "senha123", "portal2026". Verificar como SUBSTRING seria excessivo — recusaria
// "umaSenhaBoaAqui99", que é uma senha perfeitamente boa.
const BASES_OBVIAS = [
  "senha", "password", "qwerty", "abcd", "asdf", "portal", "orcamento",
  "akr", "akrbrands", "kingjoe", "king", "admin", "teste", "1234",
];

// Estas são recusadas em qualquer posição: já circularam como senha padrão, e
// uma senha que as contenha é a primeira que alguém tenta.
const PROIBIDAS = ["king@123", "mudar@123", "trocar@123"];

export function criticarSenha(senha, { login, nome } = {}) {
  const valor = (senha ?? "").normalize("NFKC");

  if (valor.length < TAMANHO_MINIMO) {
    return `A senha precisa de pelo menos ${TAMANHO_MINIMO} caracteres.`;
  }
  if (valor.length > 200) return "A senha é longa demais.";
  if (valor.trim() !== valor) return "A senha não pode começar nem terminar com espaço.";

  const simples = valor.toLowerCase();

  if (PROIBIDAS.some((proibida) => simples.includes(proibida))) {
    return "Essa senha é fácil demais de adivinhar. Escolha outra.";
  }

  // Tira o que costuma ser enfeite no fim ("senha123", "portal@2026") para
  // comparar com a palavra que sobrou.
  const raiz = simples.replace(/[\d\W_]+$/u, "");
  if (BASES_OBVIAS.some((base) => simples === base || raiz === base)) {
    return "Essa senha é fácil demais de adivinhar. Escolha outra.";
  }
  if (login && simples.includes(String(login).toLowerCase())) {
    return "A senha não pode conter o seu login.";
  }
  // Primeiro nome: e a primeira tentativa de quem conhece a pessoa.
  const primeiroNome = String(nome ?? "").trim().split(/\s+/)[0];
  if (primeiroNome && primeiroNome.length >= 4 && simples.includes(primeiroNome.toLowerCase())) {
    return "A senha não pode conter o seu nome.";
  }
  if (new Set(valor).size < 5) return "A senha tem repetição demais. Varie mais os caracteres.";

  return null;
}

// --------------------------------------------------------------------------
// Primeira senha
//
// Sorteada, nunca fixa: senha padrao igual para todo mundo vira a chave-mestra
// do portal no dia em que uma pessoa a repassa por WhatsApp.
//
// Alfabeto sem 0/O/1/l/I: esta senha vai ser lida em voz alta ou copiada a mao,
// e confundir zero com O e o jeito mais comum de "a senha nao funciona".
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Senha padrão
//
// Uma senha só, conhecida internamente, entregue a todo mundo. Foi decisão do
// dono do portal, pela praticidade de não ter que repassar uma senha diferente
// para cada pessoa.
//
// O preço, para ficar registrado: ela vale da concessão do acesso até o primeiro
// login. Nessa janela, quem souber a senha padrão entra COMO a pessoa e define a
// senha dela — ficando com a conta. Não é o estranho da internet (o Cloudflare
// Access barra antes), é quem já está dentro. Por isso:
//
//   - `TROCAR_SENHA` nasce ligado e o portal fica trancado até a troca, o que
//     encurta a janela ao máximo que dá;
//   - a tela de Usuários mostra quem ainda não trocou, para a janela ser vista
//     e cobrada em vez de ficar aberta em silêncio;
//   - a senha padrão é recusada como senha NOVA, então ninguém a mantém.
//
// `SENHA_PADRAO` no .env troca o valor sem mexer no código.
// --------------------------------------------------------------------------

export const SENHA_PADRAO = process.env.SENHA_PADRAO?.trim() || "king@123";

const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
const BLOCOS = 4;
const POR_BLOCO = 4;

export function sortearSenha() {
  const total = BLOCOS * POR_BLOCO;
  const bytes = randomBytes(total * 2);
  let saida = "";

  for (let i = 0, usado = 0; i < total; i += 1) {
    // Descarta o byte que cairia numa faixa incompleta, senao as primeiras
    // letras do alfabeto sairiam mais vezes que as ultimas.
    let byte = bytes[usado++];
    const limite = 256 - (256 % ALFABETO.length);
    while (byte >= limite && usado < bytes.length) byte = bytes[usado++];

    saida += ALFABETO[byte % ALFABETO.length];
    if ((i + 1) % POR_BLOCO === 0 && i + 1 < total) saida += "-";
  }

  return saida;
}
