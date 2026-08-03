#!/usr/bin/env bash
# ============================================================================
# Deploy do Portal Orcamento na VM de portais (Ubuntu, usuario `king`).
#
#   sudo bash deploy/setup.sh
#
# Idempotente: roda de novo para atualizar. Nao cria nem sobrescreve o `.env` —
# credencial nao vem do repositorio, e sobrescrever derrubaria o portal.
#
# O banco NAO precisa de migracao: e o mesmo KINGEJOE que o portal ja usa em
# desenvolvimento, com as tabelas KING_PORTAL_ORC_* e KING_IDENTIDADE_* ja
# criadas. Subir aqui e apontar outro processo para o mesmo banco.
# ============================================================================
set -euo pipefail

APP=portal-orcamento
DESTINO=/opt/$APP
PORTA=3004          # 3000-3003 ja ocupadas pelos outros portais
DONO=king

erro() { echo "erro: $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || erro "rode com sudo."
command -v node >/dev/null || erro "node nao encontrado."
command -v git  >/dev/null || erro "git nao encontrado."

# Node 20.6+ por causa de `--env-file`, que este servico usa para ler o .env.
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
         if (a<20 || (a===20 && b<6)) { console.error("Node 20.6+ necessario, achei "+process.versions.node); process.exit(1); }'

# Branch a implantar. `git clone` sem isto traz a branch padrao do repositorio,
# que pode nao ser a que tem o que se quer publicar -- e o portal subiria sem
# reclamar, so faltando metade das funcionalidades.
BRANCH=${BRANCH:-main}

echo "==> codigo em $DESTINO (branch $BRANCH)"
if [[ -d $DESTINO/.git ]]; then
  sudo -u $DONO git -C "$DESTINO" fetch origin "$BRANCH"
  sudo -u $DONO git -C "$DESTINO" checkout "$BRANCH"
  sudo -u $DONO git -C "$DESTINO" pull --ff-only origin "$BRANCH"
else
  mkdir -p "$DESTINO"
  chown $DONO:$DONO "$DESTINO"
  [[ -n ${REPO:-} ]] || erro "primeira instalacao: informe o repositorio, ex.  REPO=https://github.com/... sudo -E bash deploy/setup.sh"
  sudo -u $DONO git clone --branch "$BRANCH" "$REPO" "$DESTINO"
fi

echo "    commit: $(sudo -u $DONO git -C "$DESTINO" log --oneline -1)"

# --- .env -------------------------------------------------------------------
# Precisa existir ANTES do build: sem ele o servico sobe e morre no primeiro
# acesso ao banco, e o erro aparece longe da causa.
if [[ ! -f $DESTINO/.env ]]; then
  cat >&2 <<AVISO

  Falta $DESTINO/.env

  Copie o modelo e preencha (SQL Server, LDAP, PORTAL_ADMINS):
      sudo -u $DONO cp $DESTINO/.env.example $DESTINO/.env
      sudo -u $DONO nano $DESTINO/.env

  Especifico desta VM:
      API_PORT=$PORTA
      API_HOST=127.0.0.1     # so o cloudflared, no mesmo host, precisa alcancar

  Depois rode este script de novo.

AVISO
  exit 1
fi

chown $DONO:$DONO "$DESTINO/.env"
chmod 600 "$DESTINO/.env"   # tem senha do banco e do AD: so o dono le

echo "==> dependencias e build"
sudo -u $DONO npm ci --prefix "$DESTINO"
sudo -u $DONO npm run build --prefix "$DESTINO"
[[ -f $DESTINO/dist/index.html ]] || erro "build nao gerou dist/index.html."

echo "==> testes"
sudo -u $DONO npm test --prefix "$DESTINO"

echo "==> servico systemd"
install -m 644 "$DESTINO/deploy/$APP.service" "/etc/systemd/system/$APP.service"
systemctl daemon-reload
systemctl enable --now $APP
systemctl restart $APP

sleep 2
systemctl is-active --quiet $APP || { journalctl -u $APP -n 30 --no-pager; erro "servico nao subiu."; }

echo "==> conferindo"
curl -fsS "http://127.0.0.1:$PORTA/api/health" && echo
curl -fsSI "http://127.0.0.1:$PORTA/" | head -1

cat <<FIM

Portal Orcamento no ar em 127.0.0.1:$PORTA (servico $APP).

Falta, no painel da Cloudflare (Zero Trust):
  1. Tunnel `portal-modelagem` -> Rotas -> Adicionar
       Subdomain: orcamento   Domain: akrbrands.com.br   Path: vazio
       Type HTTP  ->  URL http://localhost:$PORTA
  2. Access -> Applications -> Add: orcamento.akrbrands.com.br
       Sem isto o formulario de login, que valida senha de rede do AD,
       fica alcancavel por qualquer um na internet.
  3. Card novo no hub (/var/www/hub/index.html).

Logs:     journalctl -u $APP -f
Reiniciar: sudo systemctl restart $APP
FIM
