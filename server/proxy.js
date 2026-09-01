import { isIP } from "node:net";

const ALIASES = new Set(["loopback", "linklocal", "uniquelocal"]);

function enderecoValido(item) {
  if (ALIASES.has(item)) return true;
  const [endereco, prefixo, sobra] = item.split("/");
  if (sobra !== undefined || !isIP(endereco)) return false;
  if (prefixo === undefined) return true;
  const bits = isIP(endereco) === 4 ? 32 : 128;
  return /^\d+$/.test(prefixo) && Number(prefixo) >= 0 && Number(prefixo) <= bits;
}

// Valores numéricos em arquivo .env são strings para o Express. "1" não vira
// um salto de proxy: vira um endereço IPv4 abreviado. Rejeitar na subida evita
// que o rate limit agrupe a empresa inteira ou confie num peer inesperado.
export function trustProxyDaEnv(valor) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "loopback";
  if (bruto.toLowerCase() === "false") return false;
  if (/^\d+$/.test(bruto)) {
    throw new Error("TRUST_PROXY não aceita número em .env; use `loopback` ou IP/CIDR explícito.");
  }

  const itens = bruto.split(",").map((item) => item.trim()).filter(Boolean);
  if (!itens.length || itens.some((item) => !enderecoValido(item))) {
    throw new Error("TRUST_PROXY inválido; use `loopback` ou uma lista de IPs/CIDRs confiáveis.");
  }
  return itens.length === 1 ? itens[0] : itens;
}
