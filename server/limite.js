// ============================================================================
// LIMITE DE TENTATIVAS DE LOGIN
//
// O risco aqui não é adivinhar senha — é TRAVAR CONTA. Um script batendo em
// /api/login com logins reais e senhas erradas dispara a política de bloqueio do
// Active Directory e tira a pessoa do e-mail, do Windows e de todos os portais,
// não só deste. Sem nada segurando, o portal vira o gatilho.
//
// POR LOGIN (a proteção que importa)
// Depois de algumas falhas o portal para de encaminhar aquele login ao AD, então
// o contador de bloqueio de lá nem chega a subir. Isto é, em si, uma negação de
// serviço em miniatura: dá para impedir alguém de entrar por alguns minutos. É
// de longe o menor dos dois males — a espera aqui passa sozinha; o bloqueio no
// AD precisa de alguém do TI para destravar.
//
// POR ORIGEM (contra varredura)
// Conta LOGINS DISTINTOS que falharam, não tentativas. A diferença evita um tiro
// no pé: atrás de proxy reverso ou de NAT toda a empresa chega com o mesmo IP, e
// contar tentativas transformaria este limite num fusível geral — vinte pessoas
// errando a própria senha numa manhã de segunda derrubariam o portal para todos.
// Muitos logins diferentes falhando da mesma origem é varredura; a mesma pessoa
// insistindo na senha dela não é, e já está contida pelo limite por login.
//
// Se a API for para trás de um proxy, `app.set("trust proxy", ...)` precisa
// estar configurado — sem isso `req.ip` é o IP do proxy e este limite deixa de
// distinguir origens.
//
// Estado em memória. Com mais de um processo servindo a API, cada um teria a
// própria contagem e o limite efetivo seria multiplicado — nesse dia isto vira
// tabela ou cache compartilhado.
// ============================================================================

export const POR_LOGIN = { tentativas: 5, janela: 10 * 60_000, espera: 5 * 60_000 };
export const POR_ORIGEM = { logins: 20, janela: 10 * 60_000, espera: 15 * 60_000 };

export function criarLimite({ agora = () => Date.now() } = {}) {
  const porLogin = new Map();
  const porOrigem = new Map();

  const vivo = (registro, instante) =>
    registro && Math.max(registro.expiraEm ?? 0, registro.bloqueadoAte ?? 0) > instante;

  function limpar(instante) {
    for (const mapa of [porLogin, porOrigem]) {
      for (const [chave, registro] of mapa) {
        if (!vivo(registro, instante)) mapa.delete(chave);
      }
    }
  }

  const bloqueadoAte = (mapa, chave, instante) => {
    const registro = mapa.get(chave);
    return vivo(registro, instante) ? (registro.bloqueadoAte ?? 0) : 0;
  };

  return {
    // Quanto falta de bloqueio, em milissegundos. Zero = pode tentar.
    esperaRestante(login, origem) {
      const instante = agora();
      return Math.max(
        0,
        bloqueadoAte(porLogin, login, instante) - instante,
        bloqueadoAte(porOrigem, origem, instante) - instante
      );
    },

    registrarFalha(login, origem) {
      const instante = agora();
      limpar(instante);

      const atual = porLogin.get(login);
      // Janela vencida sem bloqueio: a contagem recomeça. Quem erra uma vez hoje
      // e outra na semana que vem não é ataque.
      const registro = vivo(atual, instante)
        ? atual
        : { falhas: 0, expiraEm: instante + POR_LOGIN.janela, bloqueadoAte: 0 };

      registro.falhas += 1;
      if (registro.falhas >= POR_LOGIN.tentativas) {
        registro.falhas = 0;
        registro.bloqueadoAte = instante + POR_LOGIN.espera;
        registro.expiraEm = registro.bloqueadoAte;
      }
      porLogin.set(login, registro);

      const daOrigem = porOrigem.get(origem);
      const origemAtual = vivo(daOrigem, instante)
        ? daOrigem
        : { logins: new Set(), expiraEm: instante + POR_ORIGEM.janela, bloqueadoAte: 0 };

      origemAtual.logins.add(login);
      if (origemAtual.logins.size >= POR_ORIGEM.logins) {
        origemAtual.logins = new Set();
        origemAtual.bloqueadoAte = instante + POR_ORIGEM.espera;
        origemAtual.expiraEm = origemAtual.bloqueadoAte;
      }
      porOrigem.set(origem, origemAtual);
    },

    // Acerto zera o contador do login. A origem continua contando: uma senha
    // certa no meio de uma varredura não faz a varredura virar legítima.
    registrarAcerto(login) {
      porLogin.delete(login);
    },

    // Só para teste e diagnóstico.
    tamanho() {
      return porLogin.size + porOrigem.size;
    },
  };
}
