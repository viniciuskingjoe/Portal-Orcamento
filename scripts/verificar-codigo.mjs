import { readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pastas = ["server", "scripts", "src/dados", "src/lib"];
const extensoes = new Set([".js", ".mjs"]);

function arquivosDa(pasta) {
  return readdirSync(join(raiz, pasta), { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) return arquivosDa(caminho);
    return extensoes.has(extname(entrada.name)) ? [caminho] : [];
  });
}

const arquivos = pastas.flatMap(arquivosDa);
for (const arquivo of arquivos) {
  const resultado = spawnSync(process.execPath, ["--check", arquivo], {
    cwd: raiz,
    encoding: "utf8",
  });
  if (resultado.status !== 0) {
    process.stderr.write(resultado.stderr || resultado.stdout);
    process.exit(resultado.status ?? 1);
  }
}

console.log(`${arquivos.length} arquivos JavaScript passaram na verificação de sintaxe.`);
