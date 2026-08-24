import { useEffect, useRef } from "react";

// Fundo ambiente da tela de login — três mostradores fazem o "self-test" que
// todo painel de carro/avião faz ao ligar: a agulha sobe, varre, e assenta
// num repouso. Entrar no portal = ligar o painel. Depois do self-test
// (~1,2s) o canvas para de desenhar de vez — não fica consumindo CPU/bateria
// à toa por um efeito que já terminou.
//
// Puramente decorativo (pointer-events: none, aria-hidden) — nunca compete
// com o cartão de login, que é o foco real da tela.
const DURACAO_MS = 1200;

// Abaixo disso o cartão de login ocupa quase a largura toda (ele já é
// min(400px, 100%)) — não sobra "canto" nenhum pro mostrador ser ambiente
// em vez de amontoado. Mesma linha que o resto do sistema usa pra "estreito
// de verdade" (ver breakpoints em app.css).
const LARGURA_MINIMA = 700;

// Aproxima cubic-bezier(0.16, 1, 0.3, 1) — a mesma curva de chegada do resto
// do sistema (--ease-standard), só que resolvida em JS porque Canvas não lê
// CSS easing.
function chegadaConfiante(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Três bancos de instrumento, ancorados nos cantos. `posicaoAncora` sempre
// prende o centro dentro da viewport (por isso não existe guarda de "centro
// fora da tela" — nunca aconteceria, testar isso seria código morto). Quem
// resolve tela estreita é `LARGURA_MINIMA`: abaixo dela o canvas não desenha
// nada, então nunca chega a amontoar mostrador em cima do cartão.
const MOSTRADORES = [
  { ancora: "inferior-esquerda", raio: 190, anguloRepouso: -35, anguloMax: 95, atraso: 0 },
  { ancora: "superior-direita", raio: 150, anguloRepouso: 20, anguloMax: 110, atraso: 90 },
  { ancora: "inferior-direita", raio: 120, anguloRepouso: -10, anguloMax: 80, atraso: 180 },
];

function corDoTema() {
  const estilo = getComputedStyle(document.documentElement);
  return {
    aro: estilo.getPropertyValue("--border-strong").trim() || "#bdccc6",
    marca: estilo.getPropertyValue("--muted").trim() || "#68766f",
    agulha: estilo.getPropertyValue("--accent").trim() || "#3f8ae0",
  };
}

function posicaoAncora(ancora, largura, altura, raio) {
  const margem = raio * 0.55;
  switch (ancora) {
    case "inferior-esquerda":
      return [margem, altura - margem];
    case "superior-direita":
      return [largura - margem, margem];
    case "inferior-direita":
    default:
      return [largura - margem, altura - margem];
  }
}

function desenharMostrador(ctx, cx, cy, raio, angulo, cores) {
  // Aro externo — puramente estrutural, baixo contraste de propósito: é
  // textura ambiente, não gráfico que disputa atenção com o cartão.
  ctx.strokeStyle = cores.aro;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, Math.PI * 2);
  ctx.stroke();

  // Marcas de calibração a cada 30°, como um mostrador de verdade.
  ctx.globalAlpha = 0.22;
  for (let grau = 0; grau < 360; grau += 30) {
    const rad = (grau * Math.PI) / 180;
    const interno = raio - 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * interno, cy + Math.sin(rad) * interno);
    ctx.lineTo(cx + Math.cos(rad) * raio, cy + Math.sin(rad) * raio);
    ctx.stroke();
  }

  // Agulha — o único traço com cor de marca, e mesmo assim em opacidade
  // baixa: continua sendo ambiente, não anúncio.
  const rad = (angulo * Math.PI) / 180;
  ctx.strokeStyle = cores.agulha;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(rad) * raio * 0.72, cy + Math.sin(rad) * raio * 0.72);
  ctx.stroke();

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = cores.marca;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

export default function PainelInstrumentos() {
  const telaRef = useRef(null);

  useEffect(() => {
    const canvas = telaRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cores = corDoTema();
    let largura = 0;
    let altura = 0;
    let dpr = 1;

    function ajustarTamanho() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = window.innerWidth;
      altura = window.innerHeight;
      canvas.width = largura * dpr;
      canvas.height = altura * dpr;
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${altura}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function desenharFrame(progresso) {
      ctx.clearRect(0, 0, largura, altura);
      // Redimensionou pra abaixo da linha de "estreito" no meio do
      // self-test — fica só limpo, sem tentar encaixar mostrador onde não
      // cabe ambiente nenhum.
      if (largura < LARGURA_MINIMA) return;

      for (const mostrador of MOSTRADORES) {
        const [cx, cy] = posicaoAncora(mostrador.ancora, largura, altura, mostrador.raio);

        const local = Math.min(
          1,
          Math.max(0, (progresso * DURACAO_MS - mostrador.atraso) / (DURACAO_MS * 0.7))
        );
        // Sobe rápido até o máximo, depois assenta no repouso — o gesto de
        // "self-test", não uma curva única do início ao fim.
        const t = chegadaConfiante(local);
        const angulo =
          local < 0.5
            ? mostrador.anguloMax * (t / chegadaConfiante(0.5))
            : mostrador.anguloMax +
              (mostrador.anguloRepouso - mostrador.anguloMax) *
                chegadaConfiante((local - 0.5) / 0.5);

        desenharMostrador(ctx, cx, cy, mostrador.raio, angulo, cores);
      }
    }

    function desenharRepouso() {
      desenharFrame(1);
    }

    ajustarTamanho();

    if (reduzMovimento) {
      // Sem varredura: desenha direto no repouso, sem loop de animação.
      desenharRepouso();

      const aoRedimensionar = () => {
        ajustarTamanho();
        desenharRepouso();
      };
      window.addEventListener("resize", aoRedimensionar);
      return () => window.removeEventListener("resize", aoRedimensionar);
    }

    let inicio = null;
    let quadro = null;
    let ativo = true;

    function passo(agora) {
      if (!ativo) return;
      if (inicio === null) inicio = agora;
      const decorrido = agora - inicio;
      desenharFrame(decorrido / DURACAO_MS);
      // Para de vez ao fim do self-test — nenhum rAF depois disso.
      if (decorrido < DURACAO_MS) {
        quadro = requestAnimationFrame(passo);
      }
    }

    function aoRedimensionar() {
      ajustarTamanho();
      // Só redesenha se o self-test já tiver acabado (durante ele, o
      // próprio loop já redesenha a cada frame).
      if (inicio !== null && performance.now() - inicio >= DURACAO_MS) {
        desenharRepouso();
      }
    }

    function aoMudarVisibilidade() {
      if (document.hidden) {
        ativo = false;
        if (quadro) cancelAnimationFrame(quadro);
        return;
      }
      if (inicio === null) return;
      const decorrido = performance.now() - inicio;
      if (decorrido < DURACAO_MS) {
        // Escondeu e voltou ainda dentro do self-test — retoma a varredura.
        ativo = true;
        quadro = requestAnimationFrame(passo);
      } else {
        // Escondeu e voltou depois do self-test já ter acabado — sem isto o
        // canvas ficava congelado na última pose parcial desenhada antes de
        // esconder, pra sempre (achado do critique do Impeccable).
        desenharRepouso();
      }
    }

    quadro = requestAnimationFrame(passo);
    window.addEventListener("resize", aoRedimensionar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      ativo = false;
      if (quadro) cancelAnimationFrame(quadro);
      window.removeEventListener("resize", aoRedimensionar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  return <canvas ref={telaRef} className="painel-instrumentos" aria-hidden="true" />;
}
