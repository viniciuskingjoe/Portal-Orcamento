import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Sobe API e front juntos. Sem isto é fácil rodar só `npm run dev`, e aí toda
// tela que depende do ERP falha com um erro que parece bug do portal.

if (!existsSync(".env")) {
  console.error("\n[dev] Falta o arquivo .env — copie de .env.example e preencha.\n");
  process.exit(1);
}

// Argumentos extras vão para o Vite: `npm run dev:all -- --host` ou `-- --open false`.
const extras = process.argv.slice(2);

// Chama o Vite pelo entry dele em vez de `npx vite`: sem `shell: true`, que o
// Node deprecou para spawn com argumentos, e sem depender do PATH.
const processos = [
  { nome: "api", cor: "\x1b[36m", argumentos: ["--env-file=.env", "server/index.js"] },
  { nome: "web", cor: "\x1b[35m", argumentos: ["node_modules/vite/bin/vite.js", ...extras] },
];

const filhos = [];
let encerrando = false;

function encerrar(codigo) {
  if (encerrando) return;
  encerrando = true;
  filhos.forEach((filho) => filho.kill());
  process.exit(codigo);
}

for (const { nome, cor, argumentos } of processos) {
  const filho = spawn(process.execPath, argumentos, { stdio: ["ignore", "pipe", "pipe"] });
  filhos.push(filho);

  const prefixar = (fluxo, destino) => {
    fluxo.setEncoding("utf8");
    let resto = "";
    fluxo.on("data", (pedaco) => {
      const linhas = (resto + pedaco).split("\n");
      resto = linhas.pop() ?? "";
      linhas.forEach((linha) => destino.write(`${cor}[${nome}]\x1b[0m ${linha}\n`));
    });
  };

  prefixar(filho.stdout, process.stdout);
  prefixar(filho.stderr, process.stderr);

  // Se um cai, o outro não deve ficar de pé dando a impressão de que está tudo bem.
  filho.on("exit", (codigo) => {
    if (!encerrando) console.error(`${cor}[${nome}]\x1b[0m saiu com código ${codigo}`);
    encerrar(codigo ?? 1);
  });
}

for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => encerrar(0));
