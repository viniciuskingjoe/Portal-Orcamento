import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// ============================================================================
// SENHA DO PORTAL
//
// O portal tem senha propria, separada da senha de rede. O AD ainda valida o
// PRIMEIRO acesso de cada pessoa (que assim nao precisa receber senha nenhuma);
// a partir do momento em que ela define a senha do portal, so esta abre a conta.
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

export const TAMANHO_MINIMO = 6;

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
  // Calibrada pra ~metade dos caracteres distintos — a mesma proporção de
  // quando o piso era 10 (10 caracteres, 5 distintos). Um número fixo de 5
  // ficaria cada vez mais apertado à medida que TAMANHO_MINIMO cai: numa
  // senha de 6 caracteres viraria ~83% de variedade em vez de ~50%.
  const distintosMinimos = Math.min(5, Math.max(3, Math.ceil(valor.length / 2)));
  if (new Set(valor).size < distintosMinimos) {
    return "A senha tem repetição demais. Varie mais os caracteres.";
  }

  return null;
}

// --------------------------------------------------------------------------
// Senha sorteada
//
// Nao e usada no fluxo normal -- ali a pessoa escolhe a propria senha depois de
// entrar pelo AD. Serve para `scripts/definir-senha.mjs`, quando e preciso dar
// acesso a alguem sem passar pelo AD (o DC fora do ar, por exemplo).
//
// Alfabeto sem 0/O/1/l/I: esta senha vai ser lida em voz alta ou copiada a mao,
// e confundir zero com O e o jeito mais comum de "a senha nao funciona".
// --------------------------------------------------------------------------

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
