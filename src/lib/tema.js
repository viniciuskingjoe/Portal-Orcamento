export const CHAVE_TEMA = "tema";

export function lerTemaSalvo() {
  try {
    return localStorage.getItem(CHAVE_TEMA);
  } catch {
    return null;
  }
}

export function temaInicial() {
  const salvo = lerTemaSalvo();
  if (salvo === "dark" || salvo === "light") return salvo;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function aplicarTema(tema) {
  if (tema === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Modo privativo/quota: o tema só não persiste entre sessões.
  }
}
