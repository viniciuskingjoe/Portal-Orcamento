import { useEffect, useRef } from "react";

// Fundo ambiente da tela de login — uma rede de pontos que reage ao cursor,
// acendendo em Precision Blue e puxando linha até quem chega perto. Sozinha,
// a rede é neutra e quase invisível (textura, não anúncio); o azul só
// aparece por causa do mouse — mesma regra do resto do sistema: se não é
// interativo, não é azul.
//
// Puramente decorativo (pointer-events: none, aria-hidden) — nunca compete
// com o cartão de login, que é o foco real da tela. `pointer-events: none`
// no canvas não afeta o `pointermove` da window: o cursor continua sendo
// rastreado mesmo passando por cima do cartão.
const DISTANCIA_CONEXAO = 130;
const RAIO_CURSOR = 160;
const AREA_POR_PONTO = 15000; // px² por partícula — densidade alvo.
const MIN_PONTOS = 22;
const MAX_PONTOS = 70;
const VELOCIDADE = 0.12; // px/quadro — deriva bem lenta, textura viva sem chamar atenção.

function corDoTema() {
  const estilo = getComputedStyle(document.documentElement);
  return {
    neutro: estilo.getPropertyValue("--muted").trim() || "#5a6862",
    acento: estilo.getPropertyValue("--accent").trim() || "#3f8ae0",
  };
}

function criarPontos(largura, altura) {
  const quantidade = Math.max(
    MIN_PONTOS,
    Math.min(MAX_PONTOS, Math.round((largura * altura) / AREA_POR_PONTO))
  );
  const pontos = [];
  for (let i = 0; i < quantidade; i++) {
    const angulo = Math.random() * Math.PI * 2;
    pontos.push({
      x: Math.random() * largura,
      y: Math.random() * altura,
      vx: Math.cos(angulo) * VELOCIDADE,
      vy: Math.sin(angulo) * VELOCIDADE,
    });
  }
  return pontos;
}

function desenhar(ctx, pontos, largura, altura, cursor, cores) {
  ctx.clearRect(0, 0, largura, altura);

  // Conexões entre pontos vizinhos — sempre neutras, é textura de fundo.
  ctx.lineWidth = 1;
  for (let i = 0; i < pontos.length; i++) {
    for (let j = i + 1; j < pontos.length; j++) {
      const dx = pontos[i].x - pontos[j].x;
      const dy = pontos[i].y - pontos[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist >= DISTANCIA_CONEXAO) continue;
      ctx.strokeStyle = cores.neutro;
      ctx.globalAlpha = 0.12 * (1 - dist / DISTANCIA_CONEXAO);
      ctx.beginPath();
      ctx.moveTo(pontos[i].x, pontos[i].y);
      ctx.lineTo(pontos[j].x, pontos[j].y);
      ctx.stroke();
    }
  }

  // Linhas do cursor até os pontos próximos, e os próprios pontos — só isto
  // recebe o azul de destaque, porque só isto é "interativo" nesta tela.
  for (const ponto of pontos) {
    let pertoDoCursor = 0;
    if (cursor) {
      const dist = Math.hypot(ponto.x - cursor.x, ponto.y - cursor.y);
      if (dist < RAIO_CURSOR) {
        pertoDoCursor = 1 - dist / RAIO_CURSOR;
        ctx.strokeStyle = cores.acento;
        ctx.globalAlpha = pertoDoCursor * 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cursor.x, cursor.y);
        ctx.lineTo(ponto.x, ponto.y);
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(ponto.x, ponto.y, pertoDoCursor > 0 ? 2 + pertoDoCursor : 1.5, 0, Math.PI * 2);
    ctx.fillStyle = pertoDoCursor > 0 ? cores.acento : cores.neutro;
    ctx.globalAlpha = pertoDoCursor > 0 ? 0.35 + pertoDoCursor * 0.45 : 0.28;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

export default function FundoConstelacao() {
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
    let pontos = [];
    const cursor = { x: null, y: null };

    function ajustarTamanho() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = window.innerWidth;
      altura = window.innerHeight;
      canvas.width = largura * dpr;
      canvas.height = altura * dpr;
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${altura}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pontos = criarPontos(largura, altura);
    }

    function aoMoverPonteiro(evento) {
      cursor.x = evento.clientX;
      cursor.y = evento.clientY;
      // Movimento reduzido: sem loop contínuo, só redesenha em resposta ao
      // próprio movimento — é feedback de interação, não animação autônoma.
      if (reduzMovimento) desenhar(ctx, pontos, largura, altura, cursor, cores);
    }

    ajustarTamanho();
    window.addEventListener("pointermove", aoMoverPonteiro);
    window.addEventListener("resize", ajustarTamanho);

    if (reduzMovimento) {
      desenhar(ctx, pontos, largura, altura, cursor, cores);
      return () => {
        window.removeEventListener("pointermove", aoMoverPonteiro);
        window.removeEventListener("resize", ajustarTamanho);
      };
    }

    let quadro = null;
    let ativo = true;

    function passo() {
      if (!ativo) return;
      for (const ponto of pontos) {
        ponto.x += ponto.vx;
        ponto.y += ponto.vy;
        // Sai por um lado, entra pelo outro — mantém a densidade estável
        // sem quicar (quicar chamaria mais atenção do que textura deveria).
        if (ponto.x < 0) ponto.x += largura;
        if (ponto.x > largura) ponto.x -= largura;
        if (ponto.y < 0) ponto.y += altura;
        if (ponto.y > altura) ponto.y -= altura;
      }
      desenhar(ctx, pontos, largura, altura, cursor, cores);
      quadro = requestAnimationFrame(passo);
    }

    function aoMudarVisibilidade() {
      if (document.hidden) {
        ativo = false;
        if (quadro) cancelAnimationFrame(quadro);
        return;
      }
      if (!ativo) {
        ativo = true;
        quadro = requestAnimationFrame(passo);
      }
    }

    quadro = requestAnimationFrame(passo);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      ativo = false;
      if (quadro) cancelAnimationFrame(quadro);
      window.removeEventListener("pointermove", aoMoverPonteiro);
      window.removeEventListener("resize", ajustarTamanho);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  return <canvas ref={telaRef} className="fundo-constelacao" aria-hidden="true" />;
}
