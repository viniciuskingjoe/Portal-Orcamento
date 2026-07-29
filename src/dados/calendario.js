import { MESES } from "./seeds.js";

// Um mês só tem "realizado" se já aconteceu. Antes isto era a data 2026/07
// cravada no código — a partir de agosto/2026 o sistema passaria a exibir
// realizado de mês futuro sem avisar ninguém.
export function mesTemRealizado(ano, mes, hoje = new Date()) {
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  if (ano < anoAtual) return true;
  if (ano > anoAtual) return false;
  return mes <= mesAtual;
}

export function mesesComRealizado(ano, hoje = new Date()) {
  return MESES.filter((mes) => mesTemRealizado(ano, mes, hoje)).length;
}
